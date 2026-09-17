import React from 'react';
import { Sparkles, Sun, Moon } from 'lucide-react';
import { useTheme } from '../shared/context/ThemeContext';

export const AuthLayout = ({ children, title, subtitle }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-12 selection:bg-indigo-500/20 selection:text-indigo-400">
      {/* Background ambient lighting */}
      <div className="pointer-events-none fixed -top-40 left-1/4 h-96 w-96 rounded-full bg-indigo-500/15 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-40 right-1/4 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />

      {/* Theme toggle in top right */}
      <div className="absolute right-6 top-6">
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
        >
          {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
        </button>
      </div>

      <div className="w-full max-w-md">
        {/* Branding header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/30">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Eye<span className="text-indigo-500">O</span>Job
          </h2>
          {title && (
            <h3 className="mt-2 font-display text-lg font-semibold text-[var(--text-primary)]">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {subtitle}
            </p>
          )}
        </div>

        {/* Card containing the auth form */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
