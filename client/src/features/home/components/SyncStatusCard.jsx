import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Lock,
  Clock,
  Mail,
} from 'lucide-react';
import api from '../../../shared/lib/axios';
import { googleLoginUrl } from '../../auth/api/auth.api';
import { describeSyncFreshness, isSyncStale } from '../../../shared/lib/syncFreshness';
import { Button } from '../../../shared/ui';

const RECONNECT_CODES = new Set(['GMAIL_AUTH_EXPIRED']);

export const SyncStatusCard = ({ syncStatus, onRetried }) => {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await api.post('/jobs/sync');
    } catch (err) {
      if (err.response?.status !== 409) {
        setRetryError(err.response?.data?.error || 'Retry failed. Please try again.');
      }
    } finally {
      setRetrying(false);
      onRetried?.();
    }
  };

  if (!syncStatus) {
    return (
      <div className="flex items-center gap-3 py-2 text-xs text-[var(--text-muted)]">
        <Clock className="h-4 w-4" />
        <span>No background sync recorded yet. Click "Sync Gmail" in the top bar to run your first sync.</span>
      </div>
    );
  }

  const { status, last_sync_at, last_error_code, last_error_message, total_synced } = syncStatus;

  if (status === 'syncing') {
    return (
      <div className="flex items-center justify-between rounded-xl bg-indigo-500/10 p-4 border border-indigo-500/20">
        <div className="flex items-center gap-3">
          <span className="flex h-3 w-3 rounded-full bg-indigo-500 animate-ping" />
          <div>
            <p className="text-xs font-bold text-indigo-500">
              Pipeline Sync in Progress
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Reading messages from Gmail, extracting ATS job updates, and matching applications...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'failed' || status === 'needs_reconnect') {
    const freshness = describeSyncFreshness(last_sync_at);
    const shouldReconnect = status === 'needs_reconnect' || RECONNECT_CODES.has(last_error_code);

    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
            {shouldReconnect ? <Lock className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-rose-500">
              {shouldReconnect ? 'Gmail OAuth Authorization Expired' : 'Email Sync Encountered an Error'}
            </h4>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {last_error_message || 'Could not fetch or parse messages from the Gmail mailbox.'}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {freshness ? `Last successful synchronization was ${freshness}.` : 'No successful synchronization logged.'}
            </p>
          </div>
        </div>

        {retryError && (
          <p className="text-xs font-medium text-rose-500">{retryError}</p>
        )}

        <div>
          {shouldReconnect ? (
            <a
              href={googleLoginUrl}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Reconnect Gmail Account
            </a>
          ) : (
            <Button
              variant="primary"
              size="sm"
              icon={RotateCw}
              onClick={handleRetry}
              loading={retrying}
            >
              Retry Sync Now
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Normal / healthy status
  const freshness = describeSyncFreshness(last_sync_at);
  const stale = isSyncStale(last_sync_at);

  return (
    <div className="space-y-3">
      {stale && last_sync_at && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2 text-xs text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Your inbox hasn't synced recently. Run a manual sync to check for new interview invites and job updates.</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--background-alt)]/40 p-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Status
            </p>
            <p className="font-semibold text-xs text-emerald-500">
              Synchronized & Ready
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--background-alt)]/40 p-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
            <Clock className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Last Synchronized
            </p>
            <p className="font-semibold text-xs text-[var(--text-primary)]">
              {freshness ? `${freshness}` : 'Never'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--background-alt)]/40 p-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
            <Mail className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Total Messages Analyzed
            </p>
            <p className="font-semibold text-xs text-[var(--text-primary)]">
              {total_synced ?? 0} emails
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncStatusCard;
