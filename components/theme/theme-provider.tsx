"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Check, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void; toggleTheme: () => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#171714" : "#f4f1e9");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>("light");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("polka_theme_v1");
      const initial: Theme = saved === "dark" || saved === "light" ? saved : document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      updateTheme(initial);
      applyTheme(initial);
    } catch { /* Keep the default theme when storage is unavailable. */ }
  }, []);
  const setTheme = useCallback((next: Theme) => {
    updateTheme(next);
    applyTheme(next);
    try { localStorage.setItem("polka_theme_v1", next); } catch { /* Theme remains usable when storage is unavailable. */ }
  }, []);
  const toggleTheme = useCallback(() => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"), [setTheme]);

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("Theme controls must be inside ThemeProvider.");
  return value;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { toggleTheme } = useTheme();
  return <button className={`theme-toggle ${className}`} type="button" onClick={toggleTheme} aria-label="Переключить светлую и тёмную тему" title="Сменить тему"><span className="theme-toggle-icon"><Sun size={17} /><Moon size={17} /></span><span className="theme-toggle-label">Тема</span></button>;
}

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return <div className="theme-selector" role="group" aria-label="Цветовая тема">
    <button type="button" onClick={() => setTheme("light")} className={theme === "light" ? "selected" : ""} aria-pressed={theme === "light"}><Sun size={17} />Светлая{theme === "light" ? <Check size={15} /> : null}</button>
    <button type="button" onClick={() => setTheme("dark")} className={theme === "dark" ? "selected" : ""} aria-pressed={theme === "dark"}><Moon size={17} />Тёмная{theme === "dark" ? <Check size={15} /> : null}</button>
  </div>;
}
