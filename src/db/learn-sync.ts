import { learnExecBatch, learnQueryOne } from "./learn-client";
import { api } from "../api/client";

const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

export interface Article {
  id: string;
  title: string;
  subtitle: string | null;
  content: string | null;
  notion_url: string | null;
  tags: string | null;
  published_at: string;
  sort_order: number;
}

export async function syncArticles(): Promise<void> {
  const meta = await learnQueryOne<{ value: string }>(
    `SELECT value FROM _meta WHERE key = 'last_synced_at'`
  );
  if (meta && Date.now() - parseInt(meta.value, 10) < SYNC_INTERVAL_MS) {
    const count = await learnQueryOne<{ n: number }>(`SELECT COUNT(*) as n FROM articles`);
    if ((count?.n ?? 0) > 0) return;
  }

  const { articles } = await api.get<{ articles: Article[] }>("/api/learn");

  const statements: Array<{ sql: string; bind: unknown[] }> = articles.map((a) => ({
    sql: `INSERT INTO articles (id, title, subtitle, content, notion_url, tags, published_at, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title, subtitle = excluded.subtitle,
            content = excluded.content, notion_url = excluded.notion_url,
            tags = excluded.tags, published_at = excluded.published_at,
            sort_order = excluded.sort_order`,
    bind: [a.id, a.title, a.subtitle ?? null, a.content ?? null, a.notion_url ?? null, a.tags ?? null, a.published_at, a.sort_order],
  }));

  statements.push({
    sql: `INSERT INTO _meta (key, value) VALUES ('last_synced_at', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    bind: [String(Date.now())],
  });

  await learnExecBatch(statements);
}
