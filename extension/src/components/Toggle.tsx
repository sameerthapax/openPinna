export function Toggle({
  label,
  description,
  checked,
  onChange,
  theme = "dark",
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  theme?: "dark" | "light";
}) {
  const activeClasses =
    theme === "dark"
      ? "border-[rgba(237,243,236,0.18)] bg-[rgba(237,243,236,0.18)]"
      : "border-[rgba(80,101,72,0.26)] bg-[rgba(80,101,72,0.18)]";

  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--op-border)] py-4 last:border-b-0">
      <div>
        <span className="block text-sm font-medium tracking-[-0.01em] text-[var(--op-text)]">
          {label}
        </span>
        {description ? (
          <span className="mt-1 block text-xs leading-5 text-[var(--op-muted)]">
            {description}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 overflow-hidden rounded-full border transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] ${
          checked ? activeClasses : "border-[var(--op-border)] bg-[var(--op-soft)]"
        }`}
      >
        <span
          className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-[var(--op-text)] shadow-[0_10px_24px_-16px_rgba(0,0,0,0.55)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            checked ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
