import { useCallback, useEffect, useState } from "react";

/**
 * Student-chosen library theme. This is a purely presentational preference,
 * stored per device — it never affects roles, tenancy or authorization.
 */
export const COMPANION_THEMES = [
  { id: "monsters", label: "Cute Monsters", blurb: "A bookish monster in glasses" },
  { id: "sports", label: "Sports", blurb: "Bouncing ball accents" },
  { id: "anime", label: "Anime", blurb: "Stylised badges and aura glows" },
  { id: "cinema", label: "Movies / Cinema", blurb: "Film reel micro-interactions" },
  { id: "music", label: "Music", blurb: "Headphones and a soft visualiser" },
  { id: "cartoons", label: "Cartoons", blurb: "Playful adventure avatar" },
  { id: "academic", label: "Minimalist Academic", blurb: "Subtle page flip and glow" },
] as const;

export type CompanionTheme = (typeof COMPANION_THEMES)[number]["id"];

const STORAGE_KEY = "shelfi.companion-theme";
const DEFAULT_THEME: CompanionTheme = "academic";

function isTheme(value: string | null): value is CompanionTheme {
  return Boolean(value) && COMPANION_THEMES.some((t) => t.id === value);
}

export function useCompanionTheme() {
  // Start from the default so server and first client render match; the stored
  // value is applied after hydration.
  const [theme, setThemeState] = useState<CompanionTheme>(DEFAULT_THEME);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isTheme(stored)) setThemeState(stored);
    } catch {
      /* storage unavailable — keep the default */
    }
  }, []);

  const setTheme = useCallback((next: CompanionTheme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("shelfi-theme-change", { detail: next }));
    }
  }, []);

  useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<CompanionTheme>).detail;
      if (isTheme(next)) setThemeState(next);
    };
    window.addEventListener("shelfi-theme-change", onChange);
    return () => window.removeEventListener("shelfi-theme-change", onChange);
  }, []);

  return { theme, setTheme };
}

export function themeLabel(theme: CompanionTheme) {
  return COMPANION_THEMES.find((t) => t.id === theme)?.label ?? "Shelfi";
}

export const themeGreeting: Record<CompanionTheme, string> = {
  monsters: "Your reading monster is ready.",
  sports: "Warm up — today's reading run starts here.",
  anime: "New chapter unlocked.",
  cinema: "Roll the opening scene.",
  music: "Press play on your next chapter.",
  cartoons: "Adventure time in the library.",
  academic: "A quiet page is waiting for you.",
};
