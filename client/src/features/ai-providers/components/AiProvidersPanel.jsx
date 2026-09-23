import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ExternalLink, ArrowUp, ArrowDown, Trash2, RefreshCw, KeyRound, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react';
import { Card, CardHeader, CardBody, Button, Badge } from '../../../shared/ui';
import {
  getProviderCatalog,
  getConnectedProviders,
  getSetupInfo,
  connectProvider,
  testStoredProvider,
  setProviderPriorities,
  disconnectProvider,
  getMonthlyUsage,
} from '../api/ai-providers.api';

const STATUS_BADGE = {
  CONNECTED: 'success',
  INVALID: 'danger',
  ERROR: 'danger',
  QUOTA_EXCEEDED: 'warning',
  RATE_LIMITED: 'warning',
  EXPIRED: 'warning',
  REVOKED: 'danger',
  DISCONNECTED: 'neutral',
};

// One connected provider's row in the personal fallback chain — up/down
// arrows reorder rather than drag-and-drop, keeping this dependency-free.
// Collapsed by default (just name + status, one line) so a fallback chain
// of several providers doesn't turn into a tall wall of cards; expanding
// a row reveals the model, reorder controls, and Test/Remove actions.
const ConnectedProviderRow = ({ provider, catalogEntry, isFirst, isLast, onMoveUp, onMoveDown, onTest, onDisconnect, busy, expanded, onToggle }) => (
  <div className="rounded-xl border border-[var(--border)] bg-[var(--background-alt)]/40">
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
    >
      <span className="text-sm font-semibold text-[var(--text-primary)]">
        {catalogEntry?.displayName || provider.provider}
      </span>
      <Badge status={STATUS_BADGE[provider.status] || 'neutral'} size="sm">
        {provider.status}
      </Badge>
      <span className="min-w-0 flex-1" />
      <ChevronDown
        className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}
      />
    </button>

    {expanded && (
      <div className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            disabled={isFirst || busy}
            onClick={onMoveUp}
            className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
            title="Move up (higher priority)"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={isLast || busy}
            onClick={onMoveDown}
            className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
            title="Move down (lower priority)"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-[var(--text-muted)]">
            {provider.model}
            {provider.last_validated_at && ` · validated ${new Date(provider.last_validated_at).toLocaleDateString()}`}
            {provider.last_error_message && ` · ${provider.last_error_message}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="xs" icon={RefreshCw} onClick={onTest} disabled={busy}>
            Test
          </Button>
          <Button variant="dangerGhost" size="xs" icon={Trash2} onClick={onDisconnect} disabled={busy}>
            Remove
          </Button>
        </div>
      </div>
    )}
  </div>
);

// Inline connect form for a single catalog provider — shown expanded under
// its card when the user clicks "Connect".
const ConnectForm = ({ providerId, catalogEntry, onConnected, onCancel }) => {
  const [setup, setSetup] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(catalogEntry.defaultModel);
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSetupInfo(providerId).then(setSetup).catch(() => setSetup(null));
  }, [providerId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await connectProvider(providerId, apiKey.trim(), model);
      onConnected();
    } catch (err) {
      // errorHandler.middleware.js's response shape is { error: message },
      // not { message }: this was silently swallowing every real server
      // error (invalid key, billing/quota issue, unsupported model, etc)
      // behind a generic fallback string.
      setError(err.response?.data?.error || 'Could not connect — check the key and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background-alt)]/60 p-4">
      {setup && (
        <ol className="list-decimal space-y-1 pl-4 text-xs text-[var(--text-secondary)]">
          {setup.steps.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      )}
      <a
        href={catalogEntry.setupUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-500 hover:text-indigo-400"
      >
        Open {catalogEntry.displayName} Console <ExternalLink className="h-3 w-3" />
      </a>

      <form onSubmit={handleSubmit} className="space-y-2">
        {catalogEntry.supportedModels?.length > 1 && (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-primary)]"
          >
            {catalogEntry.supportedModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              catalogEntry.credentialType === 'composite_account_token'
                ? 'accountId:apiToken'
                : 'Paste your API key'
            }
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-primary)]"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            className="rounded-lg border border-[var(--border)] px-2 text-xs text-[var(--text-muted)]"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        {error && <p className="text-xs font-medium text-rose-500">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="sm" loading={submitting} disabled={!apiKey.trim()}>
            Test & Connect
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};

export const AiProvidersPanel = () => {
  const [catalog, setCatalog] = useState([]);
  const [connected, setConnected] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedProvider, setExpandedProvider] = useState(null);
  // Connected-provider rows collapse to one line by default; this tracks
  // which single row (if any) is expanded — separate from expandedProvider
  // above, which is the "Add an AI Provider" connect-form toggle.
  const [expandedConnectedId, setExpandedConnectedId] = useState(null);
  // Whole "Add an AI Provider" catalog card collapses too — it's a
  // set-up-once action, not something worth taking permanent vertical
  // space once providers are already connected.
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const hasAutoOpenedRef = useRef(false);

  const load = useCallback(async () => {
    const [catalogRes, connectedRes, usageRes] = await Promise.allSettled([
      getProviderCatalog(), getConnectedProviders(), getMonthlyUsage(),
    ]);
    if (catalogRes.status === 'fulfilled') setCatalog(catalogRes.value);
    if (connectedRes.status === 'fulfilled') setConnected(connectedRes.value);
    if (usageRes.status === 'fulfilled') setUsage(usageRes.value);
    setLoading(false);

    // First load only: open the catalog by default for a brand-new user
    // with nothing connected yet (there'd be nothing else to look at
    // otherwise), but never re-force it open/closed on later refreshes
    // (Test/Remove/reorder) — that would fight the user's own toggle.
    if (!hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      if (connectedRes.status === 'fulfilled' && connectedRes.value.length === 0) {
        setCatalogOpen(true);
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const catalogById = Object.fromEntries(catalog.map((c) => [c.id, c]));
  const connectedIds = new Set(connected.map((c) => c.provider));

  const handleConnected = () => {
    setExpandedProvider(null);
    load();
  };

  const handleReorder = async (index, direction) => {
    const next = [...connected];
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= next.length) return;
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    setConnected(next); // optimistic
    await setProviderPriorities(next.map((p) => p.id));
    load();
  };

  const handleTest = async (id) => {
    setBusyId(id);
    try {
      await testStoredProvider(id);
    } finally {
      setBusyId(null);
      load();
    }
  };

  const handleDisconnect = async (id) => {
    setBusyId(id);
    try {
      await disconnectProvider(id);
    } finally {
      setBusyId(null);
      load();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-500/20 border-t-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Usage summary */}
      {usage && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {usage.source === 'BYOK' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : usage.cap && usage.callsUsed >= usage.cap ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : (
                <KeyRound className="h-4 w-4 text-indigo-500" />
              )}
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {usage.source === 'BYOK' && 'Using your own connected AI keys — unlimited'}
                {usage.source === 'MANAGED_UNLIMITED' && 'Managed plan — unlimited AI extraction'}
                {usage.source === 'MANAGED_FREE' &&
                  `Free plan — ${usage.callsUsed}/${usage.cap} AI calls used this month`}
              </span>
            </div>
            {usage.source === 'MANAGED_FREE' && (
              <div className="h-2 w-40 overflow-hidden rounded-full bg-[var(--background-alt)]">
                <div
                  className={`h-full rounded-full ${usage.callsUsed >= usage.cap ? 'bg-rose-500' : usage.callsUsed / usage.cap >= 0.8 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                  style={{ width: `${Math.min(100, (usage.callsUsed / usage.cap) * 100)}%` }}
                />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Connected providers — personal fallback chain, reorderable */}
      {connected.length > 0 && (
        <Card>
          <CardHeader
            title="Your Connected Providers"
            subtitle="Tried in order, top to bottom — the next one is used if a call fails"
          />
          <CardBody className="space-y-2">
            {connected.map((provider, index) => (
              <ConnectedProviderRow
                key={provider.id}
                provider={provider}
                catalogEntry={catalogById[provider.provider]}
                isFirst={index === 0}
                isLast={index === connected.length - 1}
                busy={busyId === provider.id}
                onMoveUp={() => handleReorder(index, -1)}
                onMoveDown={() => handleReorder(index, 1)}
                onTest={() => handleTest(provider.id)}
                onDisconnect={() => handleDisconnect(provider.id)}
                expanded={expandedConnectedId === provider.id}
                onToggle={() => setExpandedConnectedId((cur) => (cur === provider.id ? null : provider.id))}
              />
            ))}
          </CardBody>
        </Card>
      )}

      {/* Catalog — connect a new provider. Collapsed by default once at
          least one provider is already connected (see the auto-open logic
          in load() above) so this set-up-once list doesn't sit expanded
          taking space every time the page is visited. */}
      <Card>
        <CardHeader
          title="Add an AI Provider"
          subtitle="Connect your own free-tier API key for unlimited, priority extraction"
          action={
            <button
              type="button"
              onClick={() => setCatalogOpen((o) => !o)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--background-alt)] hover:text-[var(--text-primary)]"
              title={catalogOpen ? 'Collapse' : 'Expand'}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${catalogOpen ? 'rotate-180' : ''}`} />
            </button>
          }
        />
        {catalogOpen && (
        <CardBody className="space-y-3">
          {catalog.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-[var(--border)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{entry.displayName}</p>
                  <p className="text-xs text-[var(--text-muted)]">{entry.description}</p>
                </div>
                {connectedIds.has(entry.id) ? (
                  <Badge status="success" size="sm">Connected</Badge>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={KeyRound}
                    onClick={() => setExpandedProvider(expandedProvider === entry.id ? null : entry.id)}
                  >
                    Connect
                  </Button>
                )}
              </div>
              {expandedProvider === entry.id && (
                <ConnectForm
                  providerId={entry.id}
                  catalogEntry={entry}
                  onConnected={handleConnected}
                  onCancel={() => setExpandedProvider(null)}
                />
              )}
            </div>
          ))}
        </CardBody>
        )}
      </Card>
    </div>
  );
};

export default AiProvidersPanel;
