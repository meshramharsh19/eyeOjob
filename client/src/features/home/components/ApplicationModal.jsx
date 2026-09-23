import React, { useState, useEffect } from 'react';
import { X, Briefcase, Lock, Unlock, AlertCircle } from 'lucide-react';
import { Button } from '../../../shared/ui';

const STATUS_OPTIONS = [
  'Applied',
  'OA',
  'Interview',
  'HR Round',
  'Final Round',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Ghosted',
  'Closed',
];

const PLATFORM_OPTIONS = [
  'Direct',
  'LinkedIn',
  'Indeed',
  'Wellfound',
  'Internshala',
  'Naukri',
  'Greenhouse',
  'Lever',
  'Workday',
  'Other',
];

export const ApplicationModal = ({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  mode = 'create', // 'create' | 'edit' | 'verify'
}) => {
  // Editing an existing application (whether opened via the pencil icon or
  // the "Verify Now" action) must never resend applied_date — see
  // handleSubmit below for why round-tripping it through the date input is
  // unsafe. Only a brand-new manual application gets a freely editable date.
  const isVerifyMode = mode === 'edit' || mode === 'verify';
  const [formData, setFormData] = useState({
    company: '',
    role: '',
    status: 'Applied',
    platform: 'Direct',
    location: '',
    job_id: '',
    applied_date: new Date().toISOString().split('T')[0],
    notes: '',
    is_locked_by_user: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData && (mode === 'edit' || mode === 'verify')) {
      const formattedDate = initialData.applied_date
        ? new Date(initialData.applied_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      setFormData({
        company: initialData.company || '',
        role: initialData.role || '',
        status: initialData.status || 'Applied',
        platform: initialData.platform || 'Direct',
        location: initialData.location || '',
        job_id: initialData.job_id || '',
        applied_date: formattedDate,
        notes: initialData.notes || '',
        is_locked_by_user: initialData.is_locked_by_user != null ? Boolean(initialData.is_locked_by_user) : true,
      });
    } else {
      setFormData({
        company: '',
        role: '',
        status: 'Applied',
        platform: 'Direct',
        location: '',
        job_id: '',
        applied_date: new Date().toISOString().split('T')[0],
        notes: '',
        is_locked_by_user: false, // default false on create
      });
    }
    setError('');
  }, [initialData, mode, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.company.trim()) {
      setError('Company name is required.');
      return;
    }
    if (!formData.role.trim()) {
      setError('Role / Job title is required.');
      return;
    }

    setLoading(true);
    setError('');

    // Verify mode never resends applied_date — the field's value came from
    // a UTC toISOString() round-trip (see the effect above) which can drift
    // by a day depending on the user's timezone. That's an acceptable
    // display quirk, but resending it would silently overwrite the
    // email-derived date with the drifted one on every "verify" save. The
    // backend only touches applied_date when the key is present at all
    // (applications.service.js updateManualApplication), so omitting the
    // key entirely is what actually preserves the original date.
    const payload = isVerifyMode
      ? Object.fromEntries(Object.entries(formData).filter(([key]) => key !== 'applied_date'))
      : formData;

    try {
      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Operation failed. Please try again.');
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
      <div className="relative w-full max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden z-10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4.5 bg-[var(--background-alt)]/40">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 font-bold">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                {mode === 'create' ? 'Add Job Application' : 'Verify Application Details'}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                {mode === 'create'
                  ? 'Manually log a job application you applied to outside of Gmail'
                  : 'Confirm the application details are correct. The applied date stays locked.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Company */}
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Company Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="company"
                required
                placeholder="e.g. Google, Stripe"
                value={formData.company}
                onChange={handleChange}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-all"
              />
            </div>

            {/* Role */}
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Role / Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="role"
                required
                placeholder="e.g. Frontend Engineer"
                value={formData.role}
                onChange={handleChange}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Application Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-all cursor-pointer"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Platform */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Source Platform
              </label>
              <select
                name="platform"
                value={formData.platform}
                onChange={handleChange}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-all cursor-pointer"
              >
                {PLATFORM_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Location */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Location (Optional)
              </label>
              <input
                type="text"
                name="location"
                placeholder="e.g. Remote, Bangalore, NYC"
                value={formData.location}
                onChange={handleChange}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-all"
              />
            </div>

            {/* Applied Date — locked in verify mode; see handleSubmit for why */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Applied Date
                {isVerifyMode && (
                  <span className="ml-1 font-normal normal-case text-[var(--text-muted)]">
                    (locked)
                  </span>
                )}
              </label>
              <input
                type="date"
                name="applied_date"
                value={formData.applied_date}
                onChange={handleChange}
                disabled={isVerifyMode}
                title={isVerifyMode ? 'Locked — the original applied date is kept as-is on every edit.' : undefined}
                className={`w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-all ${
                  isVerifyMode ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                }`}
              />
            </div>
          </div>

          {/* Job ID */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Job / Requisition ID (Optional)
            </label>
            <input
              type="text"
              name="job_id"
              placeholder="e.g. REQ-2024-8192"
              value={formData.job_id}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-all"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Notes / Recruiter Contact (Optional)
            </label>
            <textarea
              name="notes"
              rows={2}
              placeholder="e.g. Recruiter Sarah emailed on LinkedIn. Submitted portfolio."
              value={formData.notes}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-all resize-none"
            />
          </div>

          {/* Lock State Checkbox / Card */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-alt)]/50 p-3.5 transition-colors">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                name="is_locked_by_user"
                checked={formData.is_locked_by_user}
                onChange={handleChange}
                className="mt-0.5 h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                  {formData.is_locked_by_user ? (
                    <Lock className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <Unlock className="h-3.5 w-3.5 text-indigo-500" />
                  )}
                  <span>Lock status against automated email changes</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
                  {formData.is_locked_by_user
                    ? 'Protected: Incoming emails will still attach to your timeline, but will NOT automatically overwrite your current status.'
                    : 'Auto-advance enabled: Future emails from this employer (like interview invitations or decisions) will advance this status automatically.'}
                </p>
              </div>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
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
              type="submit"
              variant="primary"
              size="sm"
              loading={loading}
            >
              {mode === 'create' ? 'Create Application' : 'Verify'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ApplicationModal;
