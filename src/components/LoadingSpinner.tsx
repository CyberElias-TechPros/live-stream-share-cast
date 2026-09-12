
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

export default function LoadingSpinner({
  size = "md",
  text,
  className
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12"
  };
  const border = {
    sm: "border-2",
    md: "border-2",
    lg: "border-[3px]"
  };

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <span
        className={cn(
          "animate-spin rounded-full border-[hsl(var(--accent-mid))] border-t-transparent",
          sizeClasses[size],
          border[size]
        )}
      />
      {text && (
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground animate-pulse">
          {text}
        </p>
      )}
    </div>
  );
}
