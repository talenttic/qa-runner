import React, { useEffect, useState, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useOfflineSupport } from "./hooks/useOfflineSupport";
import { useOnboarding } from "./components/OnboardingModal";
import { KeyboardShortcutsHelp } from "./hooks/useKeyboardShortcuts";
import "./styles.css";

// Lazy load components for code splitting
const ManualTestingPage = React.lazy(() => import("./pages/ManualTestingPage").then(({ ManualTestingPage }) => ({ default: ManualTestingPage })));
const ShareRunPage = React.lazy(() => import("./pages/ShareRunPage").then(({ ShareRunPage }) => ({ default: ShareRunPage })));
const OnboardingModal = React.lazy(() => import("./components/OnboardingModal").then(({ OnboardingModal }) => ({ default: OnboardingModal })));

type ErrorBoundaryState = { error: Error | null };

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-soft dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
        <h1 className="text-lg font-semibold">QA Runner UI crashed</h1>
        <p className="mt-2 text-sm">
          {this.state.error.message || "Unknown error"}
        </p>
        <pre className="mt-3 whitespace-pre-wrap text-xs opacity-80">
          {this.state.error.stack || "No stack trace available"}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white"
          >
            Reload App
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700"
          >
            Reset UI State
          </button>
        </div>
      </div>
    );
  }
}

export default function App() {
  const baseName = window.location.pathname.startsWith("/ui") ? "/ui" : "";
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("qa-runner:theme");
    if (stored === "dark" || stored === "light") {
      return stored;
    } else {
      // Check system preference if no stored theme
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "light";
    }
  });
  const { isOnline, isServiceWorkerRegistered, lastSyncTime } = useOfflineSupport();
  const { showOnboarding, closeOnboarding } = useOnboarding();
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [themePreset, setThemePreset] = useState<"indigo" | "emerald" | "sunset" | "custom">(() => {
    const stored = localStorage.getItem("qa-runner:theme-preset");
    if (stored === "emerald" || stored === "sunset" || stored === "custom" || stored === "indigo") {
      return stored;
    }
    return "indigo";
  });
  const [customColor, setCustomColor] = useState(() => localStorage.getItem("qa-runner:theme-custom") || "#6366f1");
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem("qa-runner:theme-contrast") === "true");

  const applyCustomBrand = (hex: string) => {
    const normalized = hex.replace("#", "");
    if (normalized.length !== 6) {
      return;
    }
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    const mix = (value: number, mixWith: number, weight: number) => Math.round(value * (1 - weight) + mixWith * weight);
    const toVar = (mixWith: number, weight: number) =>
      `${mix(r, mixWith, weight)} ${mix(g, mixWith, weight)} ${mix(b, mixWith, weight)}`;
    const root = document.documentElement;
    root.style.setProperty("--brand-50", toVar(255, 0.9));
    root.style.setProperty("--brand-100", toVar(255, 0.8));
    root.style.setProperty("--brand-200", toVar(255, 0.6));
    root.style.setProperty("--brand-300", toVar(255, 0.4));
    root.style.setProperty("--brand-500", `${r} ${g} ${b}`);
    root.style.setProperty("--brand-700", toVar(0, 0.25));
    root.style.setProperty("--brand-900", toVar(0, 0.4));
  };

  const clearCustomBrand = () => {
    const root = document.documentElement;
    root.style.removeProperty("--brand-50");
    root.style.removeProperty("--brand-100");
    root.style.removeProperty("--brand-200");
    root.style.removeProperty("--brand-300");
    root.style.removeProperty("--brand-500");
    root.style.removeProperty("--brand-700");
    root.style.removeProperty("--brand-900");
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?") {
        e.preventDefault();
        setShowKeyboardHelp(true);
      }
      if (e.key === "Escape") {
        setShowKeyboardHelp(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("qa-runner:theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-emerald", "theme-sunset", "theme-contrast", "theme-custom");
    if (themePreset === "emerald") {
      clearCustomBrand();
      root.classList.add("theme-emerald");
    } else if (themePreset === "sunset") {
      clearCustomBrand();
      root.classList.add("theme-sunset");
    } else if (themePreset === "custom") {
      root.classList.add("theme-custom");
      applyCustomBrand(customColor);
    } else {
      clearCustomBrand();
    }
    if (highContrast) {
      root.classList.add("theme-contrast");
    }
    localStorage.setItem("qa-runner:theme-preset", themePreset);
    localStorage.setItem("qa-runner:theme-custom", customColor);
    localStorage.setItem("qa-runner:theme-contrast", highContrast ? "true" : "false");
  }, [themePreset, customColor, highContrast]);

  return (
    <BrowserRouter basename={baseName}>
      <div className="min-h-screen">
        <a
          href="#qa-main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 rounded-md bg-white px-3 py-2 text-sm font-semibold text-ink-900 shadow transition dark:bg-slate-900 dark:text-slate-100"
        >
          Skip to main content
        </a>
        <main id="qa-main-content" className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-end sm:items-center px-0 pt-6">
            {/* Offline indicator */}
            {!isOnline && (
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                Offline
              </div>
            )}

            {/* Service Worker status */}
            {isServiceWorkerRegistered && (
              <div className="inline-flex items-center gap-2 rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-semibold text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200">
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                Cached
                {lastSyncTime && (
                  <span className="text-xs opacity-75">
                    {lastSyncTime.toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-white px-3 py-1 text-xs font-semibold text-ink-700 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus-visible:ring-offset-slate-950"
              aria-label="Toggle color mode"
            >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface-100 text-ink-700 dark:bg-slate-800 dark:text-slate-200">
              {theme === "dark" ? (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 3.25a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V4a.75.75 0 0 1 .75-.75Zm0 13a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Zm7.75-3.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5H20.5a.75.75 0 0 1-.75-.75Zm-16.5 0a.75.75 0 0 1 .75-.75H5.5a.75.75 0 0 1 0 1.5H4a.75.75 0 0 1-.75-.75ZM17.78 6.22a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 1 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm-11.31 11.3a.75.75 0 0 1 1.06 0l1.06 1.07a.75.75 0 1 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.07Zm12.37 1.07a.75.75 0 0 1-1.06 0l-1.06-1.07a.75.75 0 1 1 1.06-1.06l1.06 1.06a.75.75 0 0 1 0 1.07ZM7.53 7.28a.75.75 0 0 1-1.06 0L5.41 6.22a.75.75 0 1 1 1.06-1.06l1.06 1.06a.75.75 0 0 1 0 1.06Z"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M10.5 4.25a.75.75 0 0 1 .75.75v.77a7.5 7.5 0 0 0 7.48 9.98.75.75 0 0 1 .68 1.08A8.75 8.75 0 1 1 10.5 4.25Z"
                  />
                </svg>
              )}
            </span>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowThemePanel((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-white px-3 py-1 text-xs font-semibold text-ink-700 shadow-sm transition dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                aria-label="Theme customization"
              >
                Theme
              </button>
              {showThemePanel ? (
                <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-surface-200 bg-white p-4 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">
                    Preset
                  </label>
                  <select
                    value={themePreset}
                    onChange={(event) => setThemePreset(event.target.value as typeof themePreset)}
                    className="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="indigo">Indigo (default)</option>
                    <option value="emerald">Emerald</option>
                    <option value="sunset">Sunset</option>
                    <option value="custom">Custom</option>
                  </select>
                  {themePreset === "custom" ? (
                    <label className="mt-3 flex items-center justify-between gap-2 text-ink-700 dark:text-slate-200">
                      <span>Custom color</span>
                      <input
                        type="color"
                        value={customColor}
                        onChange={(event) => setCustomColor(event.target.value)}
                        className="h-8 w-12 rounded border border-surface-300 bg-white dark:border-slate-700 dark:bg-slate-950"
                      />
                    </label>
                  ) : null}
                  <label className="mt-3 flex items-center gap-2 text-ink-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={highContrast}
                      onChange={(event) => setHighContrast(event.target.checked)}
                      className="h-4 w-4 rounded border-surface-300 text-brand-500 focus:ring-brand-500 dark:border-slate-700"
                    />
                    High contrast
                  </label>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setShowKeyboardHelp(true)}
            className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-white px-3 py-1 text-xs font-semibold text-ink-700 shadow-sm transition dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            aria-label="Keyboard shortcuts help (?) "
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
              <path
                fill="currentColor"
                d="M11.8 10c-.5 0-1-.45-1-1s.5-1 1-1 1 .45 1 1-.45 1-1 1zm6.5 0c-.5 0-1-.45-1-1s.5-1 1-1 1 .45 1 1-.45 1-1 1zm5.7 8.5c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2v-9c0-1.1.9-2 2-2h19c1.1 0 2 .9 2 2v9zm-2.2-3h-4.5v2h4.5v-2zm0-2.5h-4.5v2h4.5v-2zm-5.5 4.5h-4.5v2h4.5v-2zm0-2.5h-4.5v2h4.5v-2zm-5.5 4.5H2v2h4.5v-2zm0-2.5H2v2h4.5v-2z"
              />
            </svg>
            Shortcuts
          </button>
        </div>
        <AppErrorBoundary>
          <Suspense fallback={
            <div className="flex min-h-[400px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"></div>
                <p className="mt-2 text-sm text-ink-600 dark:text-slate-400">Loading QA Runner...</p>
              </div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<ManualTestingPage />} />
              <Route path="/share/:shareId" element={<ShareRunPage />} />
            </Routes>
          </Suspense>
        </AppErrorBoundary>
        <footer className="mt-8 text-center text-sm text-ink-400 dark:text-slate-400">
          <p>QA Runner UI - Version 0.1.0</p>
          <p className="mt-1">
            Need help? Check the{" "}
            <a
              href="https://github.com/your-org/qa-runner"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              documentation
            </a>
          </p>
        </footer>
        {showOnboarding && (
          <Suspense fallback={null}>
            <OnboardingModal onClose={closeOnboarding} />
          </Suspense>
        )}
        <KeyboardShortcutsHelp
          isOpen={showKeyboardHelp}
          onClose={() => setShowKeyboardHelp(false)}
        />
        </main>
      </div>
    </BrowserRouter>
  );
}
