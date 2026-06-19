import { useRef, useEffect, type ReactNode, type CSSProperties } from "react";

interface ScreenNavProps {
  back?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}

export function ScreenNav({ back, children, style }: ScreenNavProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const restRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const screen = navRef.current?.closest(".screen");
    if (!screen || !backRef.current || !restRef.current) return;

    const onScroll = () => {
      const isScrolled = screen.scrollTop > 8;
      backRef.current!.classList.toggle("is-scrolled", isScrolled);
      restRef.current!.classList.toggle("is-hidden", isScrolled);
    };

    screen.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => screen.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div ref={navRef} className="screen-nav" style={style}>
        {back && (
          <div ref={backRef} className="back-btn-wrap">
            {back}
          </div>
        )}
        {!!children && (
          <div ref={restRef} className="nav-rest">
            {children}
          </div>
        )}
      </div>
      <div className="screen-nav-spacer" />
    </>
  );
}
