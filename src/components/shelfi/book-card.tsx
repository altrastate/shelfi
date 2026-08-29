import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import type { ReadingResource } from "@/lib/reading";
import { cn } from "@/lib/utils";

export function CoverArt({
  title,
  url,
  className,
}: {
  title: string;
  url?: string | null | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "shelfi-book flex aspect-[2/3] w-full items-center justify-center overflow-hidden bg-secondary",
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`Cover of ${title}`}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <BookOpen className="size-7 text-primary/70" />
      )}
    </div>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-teal to-accent transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** Animated ring used by the "Continue reading" hero. */
export function ProgressRing({
  percent,
  size = 64,
  children,
}: {
  percent: number;
  size?: number;
  children?: React.ReactNode;
}) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-secondary)" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.min(100, Math.max(0, percent))) / 100}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <span className="absolute text-xs font-semibold text-foreground">{children}</span>
    </span>
  );
}

export function BookCard({
  resource,
  coverUrl,
  percent,
  caption,
}: {
  resource: ReadingResource;
  coverUrl?: string | null;
  percent?: number | undefined;
  caption?: string | undefined;
}) {
  return (
    <Link
      to="/catalogue/$resourceId"
      params={{ resourceId: resource.id }}
      className="group block min-w-0"
    >
      <CoverArt title={resource.title} url={coverUrl} className="transition-shadow group-hover:shadow-lift" />
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
        {resource.title}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {caption ?? resource.author_name ?? "Unknown author"}
      </p>
      {typeof percent === "number" ? (
        <>
          <ProgressBar percent={percent} />
          <p className="mt-1 text-[11px] text-muted-foreground">{percent}% complete</p>
        </>
      ) : null}
    </Link>
  );
}
