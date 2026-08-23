import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type ThemeMode = "dark" | "light";

type ThemeContextValue = {
  mode: ThemeMode;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  toggle: () => {},
});

const STORAGE_KEY = "ddos_theme_mode";

function getInitialMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  // Fall back to the visitor's OS preference on first-ever visit.
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggle = () => setMode((prev) => (prev === "dark" ? "light" : "dark"));

  return <ThemeContext.Provider value={{ mode, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
