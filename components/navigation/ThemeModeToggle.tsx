"use client";

import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { useThemeMode } from "@/components/navigation/ThemeProvider";

export function ThemeModeToggle() {
  const { theme, toggleTheme } = useThemeMode();

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="group inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[var(--muted-foreground)]/50 active:scale-[0.98]"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--surface-soft)] px-1.5">
        <span
          className={`grid h-5 w-5 place-items-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${!isDark ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]"}`}
        >
          <SunIcon className="h-3.5 w-3.5" />
        </span>
        <span
          className={`grid h-5 w-5 place-items-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isDark ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]"}`}
        >
          <MoonIcon className="h-3.5 w-3.5" />
        </span>
      </span>
    </button>
  );
}
