import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth';
import api from '../lib/axios';

const Header = ({ onSynced, isSyncingOnServer }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  // A sync can be running without this tab being the one that started it —
  // a page reload mid-sync, another tab, or the background scheduler
  // (server/src/pipelines/email-pipeline/ingestion/scheduler.js) can all be
  // the actual owner. `syncing` only tracks *this tab's own* in-flight
  // request, so without this the Stop button would never show for those
  // cases even though the server really is syncing.
  useEffect(() => {
    if (isSyncingOnServer) setSyncing(true);
  }, [isSyncingOnServer]);

  const showSyncing = syncing || isSyncingOnServer;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSyncJobs = async () => {
    if (showSyncing) return;
    setSyncing(true);
    setStopping(false);
    setSyncMessage(null);
    try {
      // This request stays open for as long as the pipeline runs server-side
      // (or until a stop is requested and the current in-flight worker batch
      // winds down) — see handleStopSync for the concurrent request that
      // cancels it mid-way.
      const { data } = await api.post('/jobs/sync');
      setSyncMessage({ type: 'success', text: data?.message || 'Sync complete' });
    } catch (err) {
      // The API's error convention is { error: message } (see
      // errorHandler.middleware.js), not { message } — this was reading the
      // wrong key and always falling through to the generic fallback text.
      setSyncMessage({
        type: 'error',
        text: err.response?.data?.error || 'Sync failed. Please try again.',
      });
    } finally {
      setSyncing(false);
      setStopping(false);
      // Refresh regardless of outcome — sync_status is persisted on
      // success, failure, and stop now, so the dashboard's SyncStatusCard
      // should reflect whichever just happened.
      onSynced?.();
    }
  };

  const handleStopSync = async () => {
    if (!showSyncing || stopping) return;
    setStopping(true);
    try {
      await api.post('/jobs/sync/stop');
    } catch (err) {
      setSyncMessage({
        type: 'error',
        text: err.response?.data?.error || 'Could not stop sync.',
      });
      setStopping(false);
      return;
    }
    // If this tab didn't originate the sync (isSyncingOnServer-only case),
    // there's no in-flight /jobs/sync request here whose `finally` will ever
    // fire — so a poll is what actually clears the button once the server
    // confirms the sync has wound down.
    if (!syncing) {
      setTimeout(() => onSynced?.(), 1000);
    }
  };

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3 shadow-[var(--shadow-sm)]">
      <div className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
        EyeOJob
      </div>

      <div className="flex items-center gap-3">
        {syncMessage && (
          <span
            className="text-xs font-medium"
            style={{ color: syncMessage.type === 'error' ? 'var(--danger)' : 'var(--success)' }}
          >
            {syncMessage.text}
          </span>
        )}

        <button
          type="button"
          onClick={handleSyncJobs}
          disabled={showSyncing}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {showSyncing && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          {showSyncing ? 'Syncing...' : 'Sync Jobs'}
        </button>

        {showSyncing && (
          <button
            type="button"
            onClick={handleStopSync}
            disabled={stopping}
            className="rounded-lg border border-[var(--danger)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[var(--danger)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {stopping ? 'Stopping...' : 'Stop Syncing'}
          </button>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
        >
          Logout
        </button>
      </div>
    </header>
  );
};

export default Header;
