// Inline editor for the per-exercise target RPE (tap the chip). Wraps BottomSheet +
// EditableNum so the screen stays render-only. Mirrors the shape of BandPicker.
import { BottomSheet } from "@shared/components/BottomSheet";
import { EditableNum } from "./EditableNum";

interface Props {
  value: number;
  onChange: (v: number) => void;
  onClose: () => void;
}

export function RpeEditorSheet({ value, onChange, onClose }: Props) {
  return (
    <BottomSheet variant="dark" onClose={onClose}>
      {() => (
        <div style={{
          padding: "8px 16px calc(28px + env(safe-area-inset-bottom, 0px))",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
        }}>
          <div style={{
            fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.12em",
            color: "rgba(245,240,232,0.55)", textTransform: "uppercase",
          }}>
            RPE objetivo
          </div>
          <EditableNum
            value={value}
            min={1}
            max={10}
            completed
            onChange={onChange}
            size={40}
          />
          <div style={{
            fontSize: 12, color: "rgba(245,240,232,0.50)", textAlign: "center", maxWidth: 260,
          }}>
            Esfuerzo percibido (1–10) para todas las series de este ejercicio.
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
