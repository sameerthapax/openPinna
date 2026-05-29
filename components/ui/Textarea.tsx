import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-28 w-full resize-y rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-[var(--muted-foreground)] focus:bg-[var(--surface-soft)] focus-visible:focus-ring",
        className,
      )}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";
