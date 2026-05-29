import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  theme?: "dark" | "light";
  children: ReactNode;
};

const variants = {
  dark: {
    primary:
      "bg-[var(--op-text)] text-[#111111] hover:bg-white disabled:bg-white/35 disabled:text-black/50",
    secondary:
      "border border-[var(--op-border)] bg-[var(--op-soft)] text-[var(--op-text)] hover:bg-[var(--op-soft-strong)]",
    ghost: "text-[var(--op-muted)] hover:bg-[var(--op-soft)] hover:text-[var(--op-text)]",
    danger:
      "border border-[rgba(247,210,210,0.3)] bg-[rgba(247,210,210,0.12)] text-[var(--op-danger)] hover:bg-[rgba(247,210,210,0.18)]",
  },
  light: {
    primary:
      "bg-[var(--op-text)] text-[var(--op-bg)] hover:bg-[#2b2a27] disabled:bg-black/20 disabled:text-white/50",
    secondary:
      "border border-[var(--op-border)] bg-[var(--op-soft)] text-[var(--op-text)] hover:bg-[var(--op-soft-strong)]",
    ghost: "text-[var(--op-muted)] hover:bg-[var(--op-soft)] hover:text-[var(--op-text)]",
    danger:
      "border border-[rgba(244,217,217,0.4)] bg-[rgba(244,217,217,0.5)] text-[var(--op-danger-text)] hover:bg-[rgba(244,217,217,0.7)]",
  },
};

export function Button({
  variant = "primary",
  theme = "dark",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-medium tracking-[-0.01em] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] disabled:pointer-events-none ${variants[theme][variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
