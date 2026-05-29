import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { learnQueryAll } from "../../db/learn-client";
import { syncArticles, type Article } from "../../db/learn-sync";
import { Ico } from "../components/icons";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" });
}

export function LearnScreen() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [articles, setArticles] = useState<Article[] | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      const local = await learnQueryAll<Article>(
        `SELECT id, title, subtitle, notion_url, tags, published_at, sort_order FROM articles ORDER BY sort_order ASC, published_at DESC`
      );
      if (active) setArticles(local);

      await syncArticles(token).catch(console.error);

      if (local.length === 0) {
        const fresh = await learnQueryAll<Article>(
          `SELECT id, title, subtitle, notion_url, tags, published_at, sort_order FROM articles ORDER BY sort_order ASC, published_at DESC`
        );
        if (active) setArticles(fresh);
      }
    })().catch((error) => {
      console.error(error);
      if (active) setArticles([]); // show empty state instead of an endless spinner
    });
    return () => { active = false; };
  }, [token]);

  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 100 }}>
        <div className="col gap-4 mt-4">
          <div className="eyebrow">Aprende</div>
          <div className="title-lg serif">Neurociencia del dolor.</div>
          <div className="body mt-2">
            Cápsulas educativas sobre cómo funciona el dolor y por qué tu cuerpo sana.
          </div>
        </div>

        {articles === null && (
          <div style={{ paddingTop: 32, textAlign: "center" }}>
            <span className="body-sm">Cargando…</span>
          </div>
        )}

        {articles !== null && articles.length === 0 && (
          <div className="card mt-24" style={{ padding: 22 }}>
            <div className="eyebrow" style={{ color: "var(--clay-deep)" }}>próximamente</div>
            <div className="title-md serif mt-8" style={{ lineHeight: 1.15 }}>
              "El dolor es una alarma, no un daño."
            </div>
            <div className="body mt-8" style={{ lineHeight: 1.6 }}>
              Las lecciones están en preparación. Aquí aprenderás por qué duele,
              cómo el movimiento baja la señal, y qué esperar en cada fase de tu recuperación.
            </div>
          </div>
        )}

        {articles !== null && articles.length > 0 && (
          <div className="col gap-12 mt-24">
            {articles.map((a) => (
              <div
                key={a.id}
                className="card card-tap"
                style={{ padding: 20, cursor: "pointer" }}
                onClick={() => navigate(`/learn/${a.id}`)}
              >
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div className="col gap-6" style={{ flex: 1 }}>
                    {a.tags && (
                      <div className="eyebrow" style={{ color: "var(--clay-deep)" }}>
                        {a.tags}
                      </div>
                    )}
                    <div className="title-md serif" style={{ lineHeight: 1.15 }}>{a.title}</div>
                    {a.subtitle && (
                      <div className="body-sm mt-4" style={{ lineHeight: 1.5 }}>{a.subtitle}</div>
                    )}
                    <div className="label mt-4">{formatDate(a.published_at)}</div>
                  </div>
                  <div style={{ marginLeft: 12, marginTop: 2 }}>
                    {a.notion_url
                      ? <Ico.globe s={16} c="var(--muted)" />
                      : <Ico.chevR s={16} c="var(--muted)" />
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
