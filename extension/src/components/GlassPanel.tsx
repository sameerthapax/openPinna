import type { ReactNode } from "react";

export function GlassPanel({
  children,
  className = "",
  theme = "dark",
}: {
  children: ReactNode;
  className?: string;
  theme?: "dark" | "light";
}) {
  return (
    <section
      data-theme={theme}
      className={`op-glass rounded-[26px] p-5 ${className}`}
    >
      {children}
    </section>
  );
}
