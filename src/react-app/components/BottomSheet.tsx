import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

type Variant = "light" | "dark";

interface Props {
  onClose: () => void;
  children: ReactNode | ((close: () => void) => ReactNode);
  variant?: Variant;
  maxWidth?: number;
}

const VARIANTS: Record<
  Variant,
  { overlay: string; blur: boolean; bg: string; handle: string }
> = {
  light: {
    overlay: "rgba(31,58,46,0.45)",
    blur: true,
    bg: "var(--bg)",
    handle: "var(--line-2)",
  },
  dark: {
    overlay: "rgba(0,0,0,0.55)",
    blur: false,
    bg: "#1A2A20",
    handle: "rgba(245,240,232,0.25)",
  },
};

export function BottomSheet({
  onClose,
  children,
  variant = "light",
  maxWidth = 480,
}: Props) {
  const [visible, setVisible] = useState(true);
  const close = () => setVisible(false);
  const v = VARIANTS[variant];

  return createPortal(
    <AnimatePresence onExitComplete={onClose}>
      {visible && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: v.overlay,
            ...(v.blur
              ? { backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }
              : {}),
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 35 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth,
              maxHeight: "calc(100vh - 60px)",
              background: v.bg,
              borderRadius: "24px 24px 0 0",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 -8px 40px rgba(31,58,46,0.18)",
            }}
          >
            {/* Handle */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingTop: 10,
                paddingBottom: 4,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 999,
                  background: v.handle,
                }}
              />
            </div>
            {typeof children === "function" ? children(close) : children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
