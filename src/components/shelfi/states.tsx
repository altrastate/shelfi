import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="shelfi-surface relative flex flex-col items-center overflow-hidden px-6 py-14 text-center">
      {/* Warm ambient illustration wash so empty screens are never flat white. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(22rem 14rem at 20% 0%, color-mix(in oklab, var(--color-accent) 16%, transparent), transparent 70%), radial-gradient(20rem 14rem at 90% 100%, color-mix(in oklab, var(--color-teal) 14%, transparent), transparent 70%)",
        }}
      />
      {icon ? (
        <div className="relative mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-soft">
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LoadingList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="shelfi-surface flex items-center gap-4 p-4">
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="shelfi-surface border-destructive/30 px-6 py-8 text-center">
      <h2 className="text-base font-semibold text-foreground">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {message ?? "We couldn't load this right now. Please try again."}
      </p>
    </div>
  );
}
