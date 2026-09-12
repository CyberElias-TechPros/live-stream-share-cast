import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("panel flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-panel-2 text-text-faint">
          {icon}
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-text">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, action }: { title?: string; message?: string; action?: ReactNode }) {
  return (
    <EmptyState
      icon={<span className="text-2xl" aria-hidden="true">⚠️</span>}
      title={title}
      description={message ?? "An unexpected error occurred. Please try again."}
      action={action}
      className="border-live/25 bg-live/5"
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-text", className)}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <Spinner className="h-7 w-7" />
      <span className="micro">{label}</span>
    </div>
  );
}
