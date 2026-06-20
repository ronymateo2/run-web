// Full-height video sheet for the exercise-detail screen. Wraps BottomSheet (size=video)
// with a VIDEO header + close button and the embedded player. Mirrors the shape of
// HowToSheet / ExerciseStatsSheet.
import { BottomSheet } from "@shared/components/BottomSheet";
import { Ico } from "@shared/components/icons";
import { VideoEmbed } from "./VideoEmbed";

interface Props {
  url: string;
  onClose: () => void;
}

export function VideoSheet({ url, onClose }: Props) {
  return (
    <BottomSheet variant="dark" size="video" onClose={onClose}>
      {(close) => (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 16px", flexShrink: 0,
          }}>
            <span style={{
              fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.12em",
              color: "rgba(245,240,232,0.55)",
            }}>
              VIDEO
            </span>
            <button
              onClick={close}
              aria-label="Cerrar"
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 4,
                display: "flex", alignItems: "center",
              }}
            >
              <Ico.close s={20} c="rgba(245,240,232,0.70)" />
            </button>
          </div>
          <div style={{
            flex: 1,
            minHeight: 0,
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}>
            <VideoEmbed url={url} variant="full" />
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
