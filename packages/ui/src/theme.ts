import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "vk-theme";

/**
 * Which theme an app starts in when nothing is remembered. The design project
 * ships light as its default; a console that is looked at for hours in a dark
 * room does not want that, so the default is the app's to choose.
 */
export interface ThemeOptions {
  /** @default "light" */
  readonly fallback?: Theme;
}

const read = (fallback: Theme): Theme => {
  if (typeof document === "undefined") {
    return fallback;
  }
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
};

/**
 * Applies the theme to <html> and remembers the choice.
 *
 * Storage is best-effort: a private-mode browser that throws on localStorage
 * should still get a working theme toggle, just not a remembered one.
 */
export const useTheme = (
  options: ThemeOptions = {}
): {
  readonly setTheme: (next: Theme) => void;
  readonly theme: Theme;
  readonly toggle: () => void;
} => {
  const fallback = options.fallback ?? "light";
  const [theme, setTheme] = useState<Theme>(() => read(fallback));

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // no persistence available; the in-page toggle still works
    }
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    []
  );

  return { setTheme, theme, toggle };
};

/**
 * Read the remembered theme and apply it before first paint. Call from an
 * inline script in <head> (or the module entry) to avoid a light flash on a
 * dark-themed reload. Honours `?theme=dark` so a link can force either.
 */
export const applyStoredTheme = (options: ThemeOptions = {}): void => {
  const fallback = options.fallback ?? "light";
  try {
    const query = new URLSearchParams(location.search).get("theme");
    const stored = query ?? localStorage.getItem(STORAGE_KEY) ?? fallback;
    if (stored === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  } catch {
    // Unreadable storage or URL. Honour the app's default rather than the
    // design system's, so a dark console stays dark in a private window.
    if (fallback === "dark") {
      document.documentElement.dataset.theme = "dark";
    }
  }
};
