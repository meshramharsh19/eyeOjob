import React, { useEffect, useState } from 'react';
import { X, Briefcase, Clock, Hourglass, Plus, Loader2 } from 'lucide-react';
import { Badge, Button } from '../../../shared/ui';
import ApplicationJourneyTimeline from './ApplicationJourneyTimeline';
import {
  getApplicationDetail, dismissTimelineEvent, addApplicationMilestone,
} from '../api/home.api';

const EVENT_TYPE_OPTIONS = [
  'APPLIED', 'APPLICATION_RECEIVED', 'APPLICATION_UNDER_REVIEW', 'SHORTLISTED',
  'ASSESSMENT_INVITED', 'ASSESSMENT_COMPLETED', 'ASSESSMENT_PASSED', 'ASSESSMENT_FAILED',
  'INTERVIEW_INVITED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'INTERVIEW_PASSED', 'INTERVIEW_FAILED',
  'OFFER_RECEIVED', 'OFFER_ACCEPTED', 'OFFER_DECLINED', 'REJECTED', 'WITHDRAWN', 'MANUAL_MILESTONE',
];

const TERMINAL_STATUSES = new Set(['Offer', 'Rejected', 'Withdrawn', 'Ghosted']);

// Presentation-only "Awaiting Update" — computed here (and mirrored by the
// server's getWithTimeline response for consistency) purely for display.
// Never written back as a stored status; silence is never inferred as
// Rejected/Withdrawn/Ghosted.
const isAwaitingUpdate = (app) => {
  if (!app) return false;
  if (app.awaitingUpdate !== undefined) return app.awaitingUpdate;
  if (TERMINAL_STATUSES.has(app.status)) return false;
  if (!app.status_changed_at) return false;
  const days = (Date.now() - new Date(app.status_changed_at).getTime()) / 86400000;
  return days > 14;
};

// Dedicated Application Journey drawer — intentionally NOT the edit form
// (ApplicationModal). This is a read-focused view of the full lifecycle
// history for one application, with journey-specific actions (dismiss
// event, add milestone, view full original email).
export const ApplicationDetailDrawer = ({ applicationId, isOpen, onClose }) => {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({ eventType: 'MANUAL_MILESTONE', eventDate: '', description: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getApplicationDetail(applicationId);
      setDetail(data);
    } catch {
      setError('Could not load application details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, applicationId]);

  if (!isOpen) return null;

  const app = detail?.application;

  const handleDismiss = async (eventId) => {
    await dismissTimelineEvent(applicationId, eventId);
    await load();
  };

  const handleAddMilestone = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addApplicationMilestone(applicationId, milestoneForm);
      setShowAddMilestone(false);
      setMilestoneForm({ eventType: 'MANUAL_MILESTONE', eventDate: '', description: '' });
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">Application Journey</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--background-alt)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-[var(--text-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          )}
          {error && <p className="text-sm text-rose-500">{error}</p>}

          {app && !loading && (
            <>
              {/* Header */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-alt)] p-4">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-indigo-500" />
                  <span className="font-display text-sm font-bold text-[var(--text-primary)]">{app.company}</span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{app.role}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge status={app.status} />
                  {isAwaitingUpdate(app) && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      <Hourglass className="h-3 w-3" /> Awaiting Update
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[var(--text-muted)]">
                  <span>Applied: {app.applied_date ? new Date(app.applied_date).toLocaleDateString() : '—'}</span>
                  <span>Last activity: {app.status_changed_at ? new Date(app.status_changed_at).toLocaleDateString() : '—'}</span>
                </div>
              </div>

              {/* Journey */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                    <Clock className="h-3.5 w-3.5" /> Journey Timeline
                  </div>
                  <Button variant="ghost" size="xs" icon={Plus} onClick={() => setShowAddMilestone((v) => !v)}>
                    Add Milestone
                  </Button>
                </div>

                {showAddMilestone && (
                  <form onSubmit={handleAddMilestone} className="mb-4 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--background-alt)] p-3">
                    <select
                      value={milestoneForm.eventType}
                      onChange={(e) => setMilestoneForm((f) => ({ ...f, eventType: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs"
                    >
                      {EVENT_TYPE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <input
                      type="date"
                      value={milestoneForm.eventDate}
                      onChange={(e) => setMilestoneForm((f) => ({ ...f, eventDate: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs"
                    />
                    <textarea
                      required
                      placeholder="What happened?"
                      value={milestoneForm.description}
                      onChange={(e) => setMilestoneForm((f) => ({ ...f, description: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs"
                      rows={2}
                    />
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="xs" onClick={() => setShowAddMilestone(false)}>Cancel</Button>
                      <Button type="submit" variant="primary" size="xs" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                    </div>
                  </form>
                )}

                <ApplicationJourneyTimeline events={detail.timeline} onDismiss={handleDismiss} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApplicationDetailDrawer;
