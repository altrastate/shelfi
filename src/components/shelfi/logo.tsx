import { cn } from "@/lib/utils";

/**
 * Shelfi mark: an open book with a geometric, angular "A/S" swoosh bridging
 * the two pages. Uses currentColor for the book and the accent token for the
 * swoosh so it works on any surface.
 */
export function ShelfiMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="Shelfi"
      className={cn("size-6", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left page */}
      <path
        d="M4 12.5 22 9.5v27.5L4 40V12.5Z"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      {/* Right page */}
      <path
        d="M44 12.5 26 9.5v27.5L44 40V12.5Z"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      {/* Angular A/S swoosh bridge */}
      <path
        d="M15 27.5 24 14l9 13.5-6.5-1.5L24 31l-2.5-5-6.5 1.5Z"
        fill="var(--color-accent)"
        stroke="var(--color-accent)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShelfiLogo({
  className,
  markClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground",
          markClassName,
        )}
      >
        <ShelfiMark className="size-5" />
      </span>
      {showWordmark ? (
        <span className="font-display text-lg font-semibold tracking-tight text-foreground">
          Shelfi
        </span>
      ) : null}
    </span>
  );
}
