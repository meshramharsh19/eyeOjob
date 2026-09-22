import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../../shared/ui';
import { getMonthlyUsage } from '../api/ai-providers.api';

// Shown on the Overview tab only when the user is close to or past their
// free-tier monthly cap — silent otherwise (BYOK/managed-unlimited users,
// or free users comfortably under 80%, see nothing here).
export const MonthlyUsageBanner = ({ onManageProviders }) => {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    getMonthlyUsage().then(setUsage).catch(() => setUsage(null));
  }, []);

  if (!usage || usage.source !== 'MANAGED_FREE' || !usage.cap) return null;
  const ratio = usage.callsUsed / usage.cap;
  if (ratio < 0.8) return null;

  const exhausted = usage.callsUsed >= usage.cap;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${
        exhausted ? 'border-rose-500/30 bg-rose-500/10' : 'border-amber-500/30 bg-amber-500/10'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <AlertTriangle className={`h-4 w-4 shrink-0 ${exhausted ? 'text-rose-500' : 'text-amber-500'}`} />
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {exhausted
            ? `You've used all ${usage.cap} free AI calls this month — syncing new emails needing AI is paused.`
            : `You're close to your monthly free limit (${usage.callsUsed}/${usage.cap} used).`}{' '}
          Connect your own API key for unlimited use.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onManageProviders}>
        Connect AI Provider
      </Button>
    </div>
  );
};

export default MonthlyUsageBanner;
