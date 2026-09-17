import { useEffect } from 'react';

const VARIANT_STYLES = {
  success: { border: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, var(--surface))' },
  error: { border: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 12%, var(--surface))' },
  info: { border: 'var(--primary)', bg: 'color-mix(in srgb, var(--primary) 12%, var(--surface))' },
};

// Fixed, self-dismissing notification — used for events the user didn't
// directly trigger in this tab (e.g. a sync finishing that started from the
// background scheduler or another tab), so they still find out it happened.
const Toast = ({ message, variant = 'info', onDismiss, duration = 6000 }) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => onDismiss?.(), duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  const { border, bg } = VARIANT_STYLES[variant] || VARIANT_STYLES.info;

  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-[var(--shadow-lg)]"
      style={{ borderColor: border, backgroundColor: bg, color: 'var(--text-primary)' }}
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        ✕
      </button>
    </div>
  );
};

export default Toast;
