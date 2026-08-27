import { useCompanionTheme, type CompanionTheme, themeGreeting } from "@/lib/theme-preference";
import { cn } from "@/lib/utils";

/**
 * Lightweight themed companion. Pure inline SVG + CSS keyframes, so it costs
 * nothing to load and respects prefers-reduced-motion globally.
 */
export function Companion({
  theme,
  className,
  animated = true,
}: {
  theme: CompanionTheme;
  className?: string;
  animated?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary",
        animated && "shelfi-bob",
        className,
      )}
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full bg-accent/25",
          animated && "shelfi-aura",
        )}
      />
      <svg viewBox="0 0 32 32" className="relative size-6" fill="none">
        <CompanionArt theme={theme} animated={animated} />
      </svg>
    </span>
  );
}

function CompanionArt({ theme, animated }: { theme: CompanionTheme; animated: boolean }) {
  switch (theme) {
    case "monsters":
      return (
        <>
          <path
            d="M6 20a10 10 0 0 1 20 0v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4Z"
            fill="currentColor"
          />
          <circle cx="12" cy="18" r="3.4" fill="var(--color-card)" />
          <circle cx="20" cy="18" r="3.4" fill="var(--color-card)" />
          <circle cx="12" cy="18" r="1.4" fill="var(--color-primary)" />
          <circle cx="20" cy="18" r="1.4" fill="var(--color-primary)" />
          <path d="M8.6 18h14.8" stroke="var(--color-accent)" strokeWidth="1.4" />
          <path d="M10 8l2 4M22 8l-2 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      );
    case "sports":
      return (
        <>
          <circle cx="16" cy="16" r="9" fill="var(--color-accent)" />
          <path
            d="M7 16h18M16 7v18M9.5 9.5c4 4 9 4 13 0M9.5 22.5c4-4 9-4 13 0"
            stroke="var(--color-primary)"
            strokeWidth="1.3"
          />
        </>
      );
    case "anime":
      return (
        <>
          <path d="M16 4l3.6 7.6L28 12.8l-6 5.8 1.5 8.2L16 23l-7.5 3.8L10 18.6l-6-5.8 8.4-1.2L16 4Z" fill="var(--color-accent)" />
          <circle cx="16" cy="16" r="3" fill="currentColor" />
        </>
      );
    case "cinema":
      return (
        <>
          <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="2" className={animated ? "shelfi-spin-slow" : undefined} style={{ transformOrigin: "16px 16px" }} />
          <circle cx="16" cy="11" r="1.8" fill="var(--color-accent)" />
          <circle cx="21" cy="18" r="1.8" fill="var(--color-accent)" />
          <circle cx="11" cy="18" r="1.8" fill="var(--color-accent)" />
        </>
      );
    case "music":
      return (
        <>
          <rect x="7" y="16" width="3" height="8" rx="1.5" fill="currentColor" />
          <rect x="12.5" y="10" width="3" height="14" rx="1.5" fill="var(--color-accent)" />
          <rect x="18" y="13" width="3" height="11" rx="1.5" fill="currentColor" />
          <rect x="23" y="18" width="3" height="6" rx="1.5" fill="var(--color-accent)" />
        </>
      );
    case "cartoons":
      return (
        <>
          <circle cx="16" cy="15" r="8" fill="var(--color-accent)" />
          <circle cx="13" cy="14" r="1.6" fill="var(--color-primary)" />
          <circle cx="19" cy="14" r="1.6" fill="var(--color-primary)" />
          <path d="M12.5 18.5c1.6 2 5.4 2 7 0" stroke="var(--color-primary)" strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
    case "academic":
    default:
      return (
        <>
          <path d="M5 9.5 15 8v16L5 25.5V9.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M27 9.5 17 8v16l10 1.5V9.5Z" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinejoin="round" />
        </>
      );
  }
}

/** Greeting block used at the top of the student home. */
export function CompanionGreeting({
  name,
  subtitle,
}: {
  name: string;
  subtitle?: string | undefined;
}) {
  const { theme } = useCompanionTheme();
  return (
    <header className="mb-5 flex items-center gap-3">
      <Companion theme={theme} className="size-12" />
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold text-foreground">
          {name ? `Hello, ${name}` : "Hello"}
        </h1>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {subtitle ?? themeGreeting[theme]}
        </p>
      </div>
    </header>
  );
}

/** Small corner accent used in the reader on milestone progress. */
export function ReaderCompanion({ percent }: { percent: number }) {
  const { theme } = useCompanionTheme();
  const milestone = percent >= 25;
  if (!milestone) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-2 rounded-full border border-border bg-card/90 px-2.5 py-1.5 shadow-soft">
      <Companion theme={theme} className="size-7" />
      <span className="text-[11px] font-medium text-muted-foreground">{percent}% read</span>
    </div>
  );
}
