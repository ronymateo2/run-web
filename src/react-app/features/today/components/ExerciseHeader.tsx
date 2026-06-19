import { Ico } from "@shared/components/icons";
import type { Exercise } from "@data/repositories";

// Title block for the exercise-detail screen: session position eyebrow, name with
// optional video / how-to buttons, and the detail paragraph.
export function ExerciseHeader({
  exercise, exerciseIds, id, onVideo, onHowTo,
}: {
  exercise: Exercise;
  exerciseIds: string[];
  id: string | undefined;
  onVideo: () => void;
  onHowTo: () => void;
}) {
  return (
    <div style={{ textAlign: "center", marginTop: 8, marginBottom: 20 }}>
      {exerciseIds.length > 1 && id && exerciseIds.indexOf(id) >= 0 && (
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Ejercicio {exerciseIds.indexOf(id) + 1} de {exerciseIds.length}
        </div>
      )}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
      }}>
        <div className="title-xl serif" style={{ color: "var(--bone)", lineHeight: 1.05 }}>
          {exercise.name ?? "Ejercicio"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {exercise.video_url && (
            <button
              onClick={onVideo}
              aria-label="Ver video"
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 4,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Ico.video s={32} c="var(--bone)" />
            </button>
          )}
          {exercise.how_to && (
            <button
              onClick={onHowTo}
              aria-label="Ver instrucciones"
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 4,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Ico.presentation s={32} c="var(--bone)" />
            </button>
          )}
        </div>
      </div>
      {exercise.detail && (
        <div className="body" style={{
          color: "rgba(245,240,232,0.80)", marginTop: 10, lineHeight: 1.6,
          maxWidth: 480, marginLeft: "auto", marginRight: "auto",
        }}>
          {exercise.detail}
        </div>
      )}
    </div>
  );
}
