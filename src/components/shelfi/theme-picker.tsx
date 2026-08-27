import { Check } from "lucide-react";
import { COMPANION_THEMES, useCompanionTheme } from "@/lib/theme-preference";
import { Companion } from "@/components/shelfi/companion";
import { cn } from "@/lib/utils";

/** Student-facing library theme + reading companion picker. */
export function ThemePicker() {
  const { theme, setTheme } = useCompanionTheme();

  return (
    <section className="shelfi-surface mt-4 p-5">
      <h2 className="text-base">Library theme</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose the companion that greets you on your home page, in the reader and in Ask Shelfi.
      </p>
      <div
        role="radiogroup"
        aria-label="Library theme"
        className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {COMPANION_THEMES.map((t) => {
          const selected = t.id === theme;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(t.id)}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                selected
                  ? "border-primary bg-secondary"
                  : "border-border bg-card hover:bg-secondary/60",
              )}
            >
              <Companion theme={t.id} animated={selected} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {t.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{t.blurb}</span>
              </span>
              {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
