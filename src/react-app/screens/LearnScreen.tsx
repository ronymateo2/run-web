import { TabBar } from "../components/TabBar";

export function LearnScreen() {
  return (
    <div className="screen">
      <div className="screen-body" style={{ paddingBottom: 100 }}>
        <div className="col gap-4 mt-4">
          <div className="eyebrow">Aprende</div>
          <div className="title-lg serif">Neurociencia del dolor.</div>
          <div className="body-sm mt-4">
            Cápsulas educativas sobre cómo funciona el dolor y por qué tu cuerpo sana.
          </div>
        </div>
        <div className="card mt-24" style={{ padding: 22 }}>
          <div className="eyebrow" style={{ color: "var(--clay-deep)" }}>próximamente</div>
          <div className="title-md serif mt-8" style={{ lineHeight: 1.15 }}>
            "El dolor es una alarma, no un daño."
          </div>
          <div className="body-sm mt-8" style={{ lineHeight: 1.6 }}>
            Las lecciones están en preparación. Aquí aprenderás por qué duele,
            cómo el movimiento baja la señal, y qué esperar en cada fase de tu recuperación.
          </div>
        </div>
      </div>
      <TabBar />
    </div>
  );
}
