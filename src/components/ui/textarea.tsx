import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-[90px] w-full rounded-lg border border-line bg-bg-raised px-3.5 py-2.5 text-sm text-text transition-colors duration-200",
        "placeholder:text-text-faint",
        "hover:border-line-strong",
        "focus:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
