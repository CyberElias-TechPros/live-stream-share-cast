import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-lg border border-line bg-bg-raised px-3.5 text-sm text-text transition-colors duration-200",
        "placeholder:text-text-faint",
        "hover:border-line-strong",
        "focus:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "aria-[invalid=true]:border-live/60 aria-[invalid=true]:ring-live/25",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
