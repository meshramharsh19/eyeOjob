import React, { useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  Clock,
  Mail,
  Sliders,
  ArrowRight,
  Zap,
  Plus,
} from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import Toast from '../../../shared/components/Toast';
import { ImportantUpdatesBanner } from '../../notifications';
import SectionCard from '../components/SectionCard';
import StatsCards from '../components/StatsCards';
import ApplicationsTable from '../components/ApplicationsTable';
import ProcessedEmailsTable from '../components/ProcessedEmailsTable';
import TimelineEventsList from '../components/TimelineEventsList';
import SyncStatusCard from '../components/SyncStatusCard';
import RoleAliasesTable from '../components/RoleAliasesTable';
import ApplicationModal from '../components/ApplicationModal';
import ApplicationDetailDrawer from '../components/ApplicationDetailDrawer';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import { Button, Tabs } from '../../../shared/ui';
import {
  getApplications,
  getApplicationStats,
  getProcessedEmails,
  getSyncStatus,
  getTimelineEvents,
  getRoleAliases,
  createApplication,
  updateApplication,
  deleteApplication,
} from '../api/home.api';

export const Home = () => {
  const [data, setData] = useState({
    stats: null,
    applications: [],
    processedEmails: [],
    timelineEvents: [],
    syncStatus: null,
    roleAliases: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const prevSyncStatusRef = useRef(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [selectedApp, setSelectedApp] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [appToDelete, setAppToDelete] = useState(null);
  const [journeyAppId, setJourneyAppId] = useState(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);

    const [stats, applications, processedEmails, timelineEvents, syncStatus, roleAliases] =
      await Promise.allSettled([
        getApplicationStats(),
        getApplications(),
        getProcessedEmails(),
        getTimelineEvents(),
        getSyncStatus(),
        getRoleAliases(),
      ]);

    setData({
      stats: stats.status === 'fulfilled' ? stats.value : null,
      applications: applications.status === 'fulfilled' ? applications.value : [],
      processedEmails: processedEmails.status === 'fulfilled' ? processedEmails.value : [],
      timelineEvents: timelineEvents.status === 'fulfilled' ? timelineEvents.value : [],
      syncStatus: syncStatus.status === 'fulfilled' ? syncStatus.value : null,
      roleAliases: roleAliases.status === 'fulfilled' ? roleAliases.value : [],
    });

    const allFailed = [stats, applications, processedEmails, timelineEvents, syncStatus, roleAliases].every(
      (result) => result.status === 'rejected'
    );
    if (allFailed) setError('Could not connect to backend server. Please ensure the server is running.');

    setLoading(false);
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // Polling during active sync
  useEffect(() => {
    if (data.syncStatus?.status !== 'syncing') return;
    const interval = setInterval(loadDashboard, 4000);
    return () => clearInterval(interval);
  }, [data.syncStatus?.status]);

  // Sync completion notification
  useEffect(() => {
    const status = data.syncStatus?.status;
    const prev = prevSyncStatusRef.current;
    prevSyncStatusRef.current = status;

    if (prev !== 'syncing' || !status || status === 'syncing') return;

    const messages = {
      success: { message: '✓ Gmail sync complete — your applications are up to date.', variant: 'success' },
      stopped: { message: 'Gmail sync was stopped.', variant: 'info' },
      failed: { message: data.syncStatus.last_error_message || 'Gmail sync failed.', variant: 'error' },
      needs_reconnect: {
        message: data.syncStatus.last_error_message || 'Gmail sync stopped — please reconnect your Gmail account.',
        variant: 'error',
      },
    };
    setToast(messages[status] || null);
  }, [data.syncStatus]);

  // Modal action handlers
  const handleOpenCreate = () => {
    setModalMode('create');
    setSelectedApp(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (app) => {
    setModalMode('edit');
    setSelectedApp(app);
    setIsModalOpen(true);
  };

  const handleSelectApplicationById = (applicationId) => {
    const app = data.applications.find((a) => a.id === applicationId);
    setActiveTab('applications');
    if (app) handleOpenEdit(app);
  };

  const handleViewJourney = (app) => setJourneyAppId(app.id);

  const handleOpenDelete = (app) => {
    setAppToDelete(app);
    setIsDeleteModalOpen(true);
  };

  const handleSubmitApplication = async (formData) => {
    if (modalMode === 'create') {
      await createApplication(formData);
      setToast({
        message: `✓ Logged manual application for ${formData.role} at ${formData.company}.`,
        variant: 'success',
      });
    } else {
      await updateApplication(selectedApp.id, formData);
      setToast({
        message: `✓ Updated application for ${formData.company}. Status locked against automated email changes.`,
        variant: 'success',
      });
    }
    loadDashboard();
  };

  const handleConfirmDelete = async (id) => {
    await deleteApplication(id);
    setToast({
      message: '✓ Application removed and safely archived.',
      variant: 'info',
    });
    loadDashboard();
  };

  const tabsConfig = [
    { id: 'overview', label: 'Overview', icon: Zap },
    {
      id: 'applications',
      label: 'Applications',
      icon: Briefcase,
      badge: data.applications?.length,
    },
    {
      id: 'timeline',
      label: 'Timeline Events',
      icon: Clock,
      badge: data.timelineEvents?.length,
    },
    {
      id: 'emails',
      label: 'Processed Emails',
      icon: Mail,
      badge: data.processedEmails?.length,
    },
    {
      id: 'aliases',
      label: 'Role Aliases',
      icon: Sliders,
      badge: data.roleAliases?.length,
    },
  ];

  return (
    <DashboardLayout
      onSynced={loadDashboard}
      isSyncingOnServer={data.syncStatus?.status === 'syncing'}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onSelectApplication={handleSelectApplicationById}
    >
      <div className="space-y-6">
        {/* Secondary tab switcher + Quick "+ Add Application" button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <Tabs
            tabs={tabsConfig}
            activeTab={activeTab}
            onChange={setActiveTab}
          />

          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={handleOpenCreate}
            className="shrink-0 self-start sm:self-auto"
          >
            Add Application
          </Button>
        </div>

        {/* Global Loading / Error states */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <span className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-500/20 border-t-indigo-500" />
              <p className="text-xs font-semibold text-[var(--text-muted)] tracking-wide uppercase">
                Loading tracker data...
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-semibold text-rose-500">
            {error}
          </div>
        )}

        {!loading && (
          <>
            {/* OVERVIEW VIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Important Job Updates — same notifications data as the header bell */}
                <ImportantUpdatesBanner onViewApplication={handleSelectApplicationById} />

                {/* Stats Summary Bar */}
                <StatsCards
                  stats={data.stats}
                  onCardClick={(key) => {
                    setActiveTab('applications');
                    setNeedsReviewOnly(key === 'needs_review');
                  }}
                />

                {/* Gmail Engine Sync Status */}
                <SectionCard
                  title="Gmail Synchronization Engine"
                  subtitle="Automatic monitoring of ATS confirmation emails and status transitions"
                  icon={Zap}
                >
                  <SyncStatusCard
                    syncStatus={data.syncStatus}
                    onRetried={loadDashboard}
                  />
                </SectionCard>

                {/* 2-Column Split: Applications & Timeline */}
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <SectionCard
                      title="Tracked Applications"
                      subtitle="Latest applications detected from inbox or added manually"
                      icon={Briefcase}
                      action={
                        <Button
                          variant="ghost"
                          size="xs"
                          iconRight={ArrowRight}
                          onClick={() => setActiveTab('applications')}
                        >
                          View All ({data.applications.length})
                        </Button>
                      }
                    >
                      <ApplicationsTable
                        applications={data.applications.slice(0, 5)}
                        onAdd={handleOpenCreate}
                        onEdit={handleOpenEdit}
                        onDelete={handleOpenDelete}
                        onViewJourney={handleViewJourney}
                      />
                    </SectionCard>
                  </div>

                  <div className="lg:col-span-1">
                    <SectionCard
                      title="Recent Activity"
                      subtitle="Timeline events stream"
                      icon={Clock}
                      action={
                        <Button
                          variant="ghost"
                          size="xs"
                          iconRight={ArrowRight}
                          onClick={() => setActiveTab('timeline')}
                        >
                          Full Stream
                        </Button>
                      }
                    >
                      <TimelineEventsList
                        events={data.timelineEvents.slice(0, 4)}
                      />
                    </SectionCard>
                  </div>
                </div>

                {/* Processed Emails preview */}
                <SectionCard
                  title="Recently Parsed Emails"
                  subtitle="Email messages processed by regex ATS parsers and AI LLM fallback"
                  icon={Mail}
                  action={
                    <Button
                      variant="ghost"
                      size="xs"
                      iconRight={ArrowRight}
                      onClick={() => setActiveTab('emails')}
                    >
                      View All Emails ({data.processedEmails.length})
                    </Button>
                  }
                >
                  <ProcessedEmailsTable
                    emails={data.processedEmails.slice(0, 5)}
                  />
                </SectionCard>
              </div>
            )}

            {/* APPLICATIONS VIEW */}
            {activeTab === 'applications' && (
              <SectionCard
                title="Job Applications Directory"
                subtitle="Complete list of all detected and tracked jobs"
                icon={Briefcase}
                action={
                  <Button
                    variant="primary"
                    size="xs"
                    icon={Plus}
                    onClick={handleOpenCreate}
                  >
                    Add Job
                  </Button>
                }
              >
                <ApplicationsTable
                  applications={data.applications}
                  onAdd={handleOpenCreate}
                  onEdit={handleOpenEdit}
                  onDelete={handleOpenDelete}
                  onViewJourney={handleViewJourney}
                  needsReviewOnly={needsReviewOnly}
                  onNeedsReviewOnlyChange={setNeedsReviewOnly}
                />
              </SectionCard>
            )}

            {/* TIMELINE VIEW */}
            {activeTab === 'timeline' && (
              <SectionCard
                title="Application Timeline Stream"
                subtitle="Chronological log of submissions, interview invites, assessments, and manual changes"
                icon={Clock}
              >
                <TimelineEventsList events={data.timelineEvents} />
              </SectionCard>
            )}

            {/* EMAILS VIEW */}
            {activeTab === 'emails' && (
              <SectionCard
                title="Processed Emails Archive"
                subtitle="Complete audit log of emails scanned by the pipeline with classification and AI confidence"
                icon={Mail}
              >
                <ProcessedEmailsTable emails={data.processedEmails} />
              </SectionCard>
            )}

            {/* ALIASES VIEW */}
            {activeTab === 'aliases' && (
              <SectionCard
                title="Canonical Role Aliases"
                subtitle="Global raw title to canonical job title mapping dictionary"
                icon={Sliders}
              >
                <RoleAliasesTable roleAliases={data.roleAliases} />
              </SectionCard>
            )}
          </>
        )}
      </div>

      {/* Application Add/Edit Modal */}
      <ApplicationModal
        isOpen={isModalOpen}
        mode={modalMode}
        initialData={selectedApp}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitApplication}
      />

      {/* Application Journey Drawer */}
      <ApplicationDetailDrawer
        applicationId={journeyAppId}
        isOpen={journeyAppId != null}
        onClose={() => setJourneyAppId(null)}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        application={appToDelete}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setAppToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
      />

      <Toast
        message={toast?.message}
        variant={toast?.variant}
        onDismiss={() => setToast(null)}
      />
    </DashboardLayout>
  );
};

export default Home;
