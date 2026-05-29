import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { learnQueryOne } from "../../db/learn-client";
import { type Article } from "../../db/learn-sync";
import { Ico } from "../components/icons";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" });
}

export function LearnArticleScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    let active = true;
    learnQueryOne<Article>(`SELECT * FROM articles WHERE id = ?`, [id])
      .then((row) => { if (active) setArticle(row); })
      .catch(() => { if (active) setArticle(null); });
    return () => { active = false; };
  }, [id]);

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 100 }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none", padding: "12px 0",
            cursor: "pointer", color: "var(--muted)", marginTop: 8,
          }}
        >
          <Ico.chevL s={16} c="var(--muted)" />
          <span className="body-sm">Aprende</span>
        </button>

        {article === undefined && (
          <div style={{ paddingTop: 32, textAlign: "center" }}>
            <span className="body-sm">Cargando…</span>
          </div>
        )}

        {article === null && (
          <div style={{ paddingTop: 32, textAlign: "center" }}>
            <span className="body-sm">Artículo no encontrado.</span>
          </div>
        )}

        {article && (
          <div className="col gap-8 mt-8">
            {article.tags && (
              <div className="eyebrow" style={{ color: "var(--clay-deep)" }}>{article.tags}</div>
            )}
            <div className="title-lg serif" style={{ lineHeight: 1.1 }}>{article.title}</div>
            {article.subtitle && (
              <div className="body mt-4" style={{ color: "var(--ink-3)", lineHeight: 1.5 }}>
                {article.subtitle}
              </div>
            )}
            <div className="label mt-4">{formatDate(article.published_at)}</div>

            <div style={{ height: 1, background: "var(--line)", margin: "16px 0" }} />

            {article.content && (
              <div
                className="body"
                style={{ lineHeight: 1.7, whiteSpace: "pre-wrap" }}
              >
                {article.content}
              </div>
            )}

            {article.notion_url && (
              <a
                href={article.notion_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-pill"
                style={{ marginTop: article.content ? 24 : 8, textDecoration: "none" }}
              >
                <Ico.globe s={18} c="var(--bone)" />
                Abrir en Notion
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
