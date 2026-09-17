import React from 'react';

export const StatsCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'var(--primary)',
  glow = false,
  className = '',
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/90 p-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-[var(--border-hover)] hover:shadow-lg ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      style={{
        boxShadow: glow ? `0 10px 30px -10px ${color}30` : undefined,
      }}
    >
      {/* Background subtle radial glow */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-10 blur-xl transition-opacity group-hover:opacity-25"
        style={{ backgroundColor: color }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            {title}
          </p>
          <div
            className="font-display text-3xl font-extrabold tracking-tight"
            style={{ color }}
          >
            {value ?? 0}
          </div>
        </div>

        {Icon && (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
            style={{
              backgroundColor: `${color}18`,
              color: color,
            }}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>

      {subtitle && (
        <div className="mt-3 flex items-center gap-1 text-xs text-[var(--text-muted)]">
          {subtitle}
        </div>
      )}
    </div>
  );
};
