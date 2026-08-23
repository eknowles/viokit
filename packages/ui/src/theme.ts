import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "vk-theme";

const read = (): Theme => {
  if (typeof document === "undefined") {
    return "light";
  }
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
};

/**
 * Applies the theme to <html> and remembers the choice.
 *
 * Storage is best-effort: a private-mode browser that throws on localStorage
 * should still get a working theme toggle, just not a remembered one.
 */
export const useTheme = (): {
  readonly setTheme: (next: Theme) => void;
  readonly theme: Theme;
  readonly toggle: () => void;
} => {
  const [theme, setTheme] = useState<Theme>(read);

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
export const applyStoredTheme = (): void => {
  try {
    const query = new URLSearchParams(location.search).get("theme");
    const stored = query ?? localStorage.getItem(STORAGE_KEY);
    if (stored === "dark") {
      document.documentElement.dataset.theme = "dark";
    }
  } catch {
    // unreadable storage or URL: fall through to the light default
  }
};
