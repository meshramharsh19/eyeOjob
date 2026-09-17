import React from 'react';

export const Card = ({
  children,
  className = '',
  glass = true,
  hover = false,
  ...props
}) => {
  return (
    <div
      className={`rounded-2xl transition-all duration-200 ${
        glass
          ? 'glass-panel'
          : 'border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]'
      } ${hover ? 'hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({
  title,
  subtitle,
  action,
  icon: Icon,
  className = '',
  children,
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] px-6 py-4.5 ${className}`}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
            <Icon className="h-4.5 w-4.5" />
          </div>
        )}
        <div>
          {title && (
            <h3 className="font-display text-base font-semibold tracking-tight text-[var(--text-primary)]">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
      {children}
    </div>
  );
};

export const CardBody = ({ children, className = '', noPadding = false }) => {
  return (
    <div className={`${noPadding ? '' : 'p-6'} ${className}`}>
      {children}
    </div>
  );
};

export const CardFooter = ({ children, className = '' }) => {
  return (
    <div
      className={`border-t border-[var(--border)] bg-[var(--background-alt)]/30 px-6 py-3.5 text-xs text-[var(--text-muted)] rounded-b-2xl ${className}`}
    >
      {children}
    </div>
  );
};
