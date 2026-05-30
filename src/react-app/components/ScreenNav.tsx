import { useRef, useState, useEffect, type ReactNode, type CSSProperties } from "react";

interface ScreenNavProps {
  back?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}

export function ScreenNav({ back, children, style }: ScreenNavProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const screen = ref.current?.closest(".screen");
    if (!screen) return;
    const onScroll = () => setScrolled(screen.scrollTop > 8);
    screen.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => screen.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div ref={ref} className="screen-nav" style={style}>
        {back && (
          <div className={`back-btn-wrap${scrolled ? " is-scrolled" : ""}`}>
            {back}
          </div>
        )}
        {!!children && (
          <div className={`nav-rest${scrolled ? " is-hidden" : ""}`}>
            {children}
          </div>
        )}
      </div>
      <div className="screen-nav-spacer" />
    </>
  );
}
