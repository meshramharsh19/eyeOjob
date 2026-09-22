import React, { useState } from 'react';
import { AlertTriangle, ShieldOff, X } from 'lucide-react';
import { Button } from '../../../shared/ui';
import { deactivateAccount } from '../../auth/api/auth.api';
import { useAuth } from '../../auth';

export const DeactivateAccountCard = () => {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { logout } = useAuth();

  const handleDeactivate = async () => {
    setLoading(true);
    setError(null);
    try {
      await deactivateAccount();
      logout();
      window.location.href = '/login';
    } catch (err) {
      setError(err.response?.data?.error || 'Could not deactivate account. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
          <ShieldOff className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Deactivate Account</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
            This signs you out and pauses your account. Nothing is deleted — your applications,
            emails, and timeline stay exactly as they are. Log back in anytime (Google or your
            password) to reactivate and pick up right where you left off.
          </p>
        </div>
      </div>

      {!confirming ? (
        <Button variant="dangerGhost" size="sm" icon={ShieldOff} onClick={() => setConfirming(true)}>
          Deactivate my account
        </Button>
      ) : (
        <div className="rounded-xl border border-rose-500/30 bg-[var(--surface)] p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Are you sure? You'll be logged out immediately and need to log back in to use EyeOJob again.
            </p>
          </div>
          {error && <p className="text-xs font-medium text-rose-500">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={X}
              onClick={() => setConfirming(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={ShieldOff}
              onClick={handleDeactivate}
              loading={loading}
            >
              Yes, deactivate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeactivateAccountCard;
