import React from 'react';

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  className = '',
  ...props
}) => {
  const baseClasses =
    'relative inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 select-none';

  const sizeClasses = {
    xs: 'text-xs px-2.5 py-1 rounded-lg gap-1.5',
    sm: 'text-xs px-3 py-1.5 rounded-xl gap-2',
    md: 'text-sm px-4 py-2 rounded-xl gap-2',
    lg: 'text-sm px-5 py-2.5 rounded-xl gap-2.5 shadow-sm',
  };

  const variantClasses = {
    primary:
      'bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/35 hover:-translate-y-0.5 active:translate-y-0 border border-indigo-400/30',
    secondary:
      'bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)] shadow-[var(--shadow-xs)] hover:border-[var(--border-hover)]',
    ghost:
      'bg-transparent hover:bg-[var(--background-alt)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
    danger:
      'bg-rose-500 hover:bg-rose-600 text-white shadow-sm shadow-rose-500/20 hover:shadow-rose-500/30 hover:-translate-y-0.5',
    dangerGhost:
      'bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 hover:text-rose-600 border border-rose-500/20',
    outline:
      'bg-transparent border border-[var(--border)] hover:border-[var(--primary)] text-[var(--text-primary)] hover:text-[var(--primary)]',
  };

  return (
    <button
      disabled={disabled || loading}
      className={`${baseClasses} ${sizeClasses[size] || sizeClasses.md} ${
        variantClasses[variant] || variantClasses.primary
      } ${className}`}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
      )}
      {!loading && Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span>{children}</span>
      {!loading && IconRight && <IconRight className="h-4 w-4 shrink-0" />}
    </button>
  );
};
