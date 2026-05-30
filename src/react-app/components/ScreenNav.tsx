import React, { useRef, useState, useEffect, type ReactNode, type CSSProperties } from "react";

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

  return (
    <>
      <div ref={ref} className="screen-nav" style={style}>
        {first && (
          <div className={`back-btn-wrap${scrolled ? " is-scrolled" : ""}`}>
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
        {rest}
      </div>
      <div className="screen-nav-spacer" />
    </>
  );
}
