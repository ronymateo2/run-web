import React, { useRef, useState, useEffect, type ReactNode, type CSSProperties } from "react";
import { BackButton } from "./BackButton";

interface ScreenNavProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function ScreenNav({ children, style }: ScreenNavProps) {
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

  const kids = React.Children.toArray(children);
  const first = kids[0];
  const rest = kids.slice(1);
  const firstEl = first as React.ReactElement<any>;
  const isSoloBack = React.isValidElement(first) && firstEl.type === BackButton && !firstEl.props.label;

  return (
    <>
      <div ref={ref} className="screen-nav" style={style}>
        {first && (
          <div className={`back-btn-wrap${scrolled ? " is-scrolled" : ""}${isSoloBack ? " is-solo" : ""}`}>
            {React.isValidElement(first)
              ? React.cloneElement(first as React.ReactElement<any>, {
                  style: {
                    ...(first as React.ReactElement<any>).props.style,
                    marginLeft: 0,
                  },
                })
              : first}
          </div>
        )}
        {rest.length > 0 && (
          <div className={`nav-rest${scrolled ? " is-hidden" : ""}`}>
            {rest}
          </div>
        )}
      </div>
      <div className="screen-nav-spacer" />
    </>
  );
}
