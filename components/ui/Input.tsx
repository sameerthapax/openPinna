import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-[6px] border border-[var(--border)] bg-white px-3 text-sm outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-[var(--muted-foreground)] focus:border-[#c9c9c6] focus:bg-[#fbfbfa]",
        className,
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";
