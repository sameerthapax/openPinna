import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  helper?: string;
  theme?: "dark" | "light";
};

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  helper?: string;
  theme?: "dark" | "light";
};

export function TextInput({
  label,
  helper,
  theme = "dark",
  className = "",
  ...props
}: TextInputProps) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--op-muted)]">
        {label}
      </span>
      <input
        data-theme={theme}
        className={`h-10 rounded-[10px] border border-[var(--op-border)] bg-[var(--op-soft)] px-3 text-sm text-[var(--op-text)] outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-[color:var(--op-muted)] focus:border-[var(--op-border-strong)] focus:bg-[var(--op-soft-strong)] ${className}`}
        {...props}
      />
      {helper ? (
        <span className="text-xs leading-5 text-[var(--op-muted)]">{helper}</span>
      ) : null}
    </label>
  );
}

export function TextArea({
  label,
  helper,
  theme = "dark",
  className = "",
  ...props
}: TextAreaProps) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--op-muted)]">
        {label}
      </span>
      <textarea
        data-theme={theme}
        className={`min-h-28 resize-y rounded-[10px] border border-[var(--op-border)] bg-[var(--op-soft)] px-3 py-2 text-sm leading-6 text-[var(--op-text)] outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-[color:var(--op-muted)] focus:border-[var(--op-border-strong)] focus:bg-[var(--op-soft-strong)] ${className}`}
        {...props}
      />
      {helper ? (
        <span className="text-xs leading-5 text-[var(--op-muted)]">{helper}</span>
      ) : null}
    </label>
  );
}
