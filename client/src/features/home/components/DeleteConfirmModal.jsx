import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '../../../shared/ui';

export const DeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  application = null,
}) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen || !application) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(application.id);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md rounded-3xl border border-rose-500/20 bg-[var(--surface)] shadow-2xl overflow-hidden z-10 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
            <Trash2 className="h-6 w-6" />
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div>
          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
            Delete Application?
          </h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
            Are you sure you want to remove your application for{' '}
            <strong className="text-[var(--text-primary)]">{application.role}</strong> at{' '}
            <strong className="text-[var(--text-primary)]">{application.company}</strong>?
          </p>
          <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--background-alt)]/60 p-3 text-[11px] text-[var(--text-muted)]">
            ℹ️ Soft-delete is used: your timeline history is safely archived and won't disrupt your processed email logs.
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleConfirm}
            loading={loading}
            icon={Trash2}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
