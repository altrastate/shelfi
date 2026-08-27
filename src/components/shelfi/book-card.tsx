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
        "flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl bg-secondary shadow-sm",
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
      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
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
