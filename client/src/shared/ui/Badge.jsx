import React from 'react';

const STATUS_VARIANTS = {
  Applied: {
    color: 'var(--status-applied)',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.25)',
  },
  Interview: {
    color: 'var(--status-interview)',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.25)',
  },
  Offer: {
    color: 'var(--status-offer)',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.25)',
  },
  Rejected: {
    color: 'var(--status-rejected)',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.25)',
  },
  Ghosted: {
    color: 'var(--status-ghosted)',
    bg: 'rgba(100, 116, 139, 0.12)',
    border: 'rgba(100, 116, 139, 0.25)',
  },
  Closed: {
    color: 'var(--status-closed)',
    bg: 'rgba(120, 113, 108, 0.12)',
    border: 'rgba(120, 113, 108, 0.25)',
  },
  'Online Assessment': {
    color: 'var(--status-oa)',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.25)',
  },
  HR: {
    color: 'var(--status-hr)',
    bg: 'rgba(236, 72, 153, 0.12)',
    border: 'rgba(236, 72, 153, 0.25)',
  },
  success: {
    color: 'var(--success)',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.25)',
  },
  warning: {
    color: 'var(--warning)',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.25)',
  },
  danger: {
    color: 'var(--danger)',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.25)',
  },
  info: {
    color: 'var(--info)',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.25)',
  },
  neutral: {
    color: 'var(--text-secondary)',
    bg: 'var(--background-alt)',
    border: 'var(--border)',
  },
};

export const Badge = ({
  children,
  variant,
  status,
  size = 'md',
  dot = true,
  className = '',
  style = {},
  ...props
}) => {
  const key = status || variant || 'neutral';
  const config = STATUS_VARIANTS[key] || STATUS_VARIANTS.neutral;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-xs',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium tracking-wide transition-colors ${
        sizeClasses[size] || sizeClasses.md
      } ${className}`}
      style={{
        color: config.color,
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
        ...style,
      }}
      {...props}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0 animate-pulse"
          style={{ backgroundColor: config.color }}
        />
      )}
      <span>{children || status || 'Unknown'}</span>
    </span>
  );
};
