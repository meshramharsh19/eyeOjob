import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Clock,
  Mail,
  Sliders,
  LogOut,
  RefreshCw,
  Sun,
  Moon,
  Zap,
  Menu,
  X,
  Square,
  Sparkles,
  Cpu,
  Settings,
} from 'lucide-react';
import { useAuth } from '../features/auth';
import { useTheme } from '../shared/context/ThemeContext';
import { NotificationBell, useNotifications } from '../features/notifications';
import { Button } from '../shared/ui';
import api from '../shared/lib/axios';

export const DashboardLayout = ({
  children,
  onSynced,
  isSyncingOnServer = false,
  activeTab = 'overview',
  setActiveTab = () => {},
  onSelectApplication = () => {},
}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { refreshNotifications } = useNotifications();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [syncBanner, setSyncBanner] = useState(null);

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
    setSyncBanner(null);
    try {
      const { data } = await api.post('/jobs/sync');
      setSyncBanner({ type: 'success', text: data?.message || 'Gmail sync finished successfully.' });
    } catch (err) {
      setSyncBanner({
        type: 'error',
        text: err.response?.data?.error || 'Sync encountered an issue. Please try again.',
      });
    } finally {
      setSyncing(false);
      setStopping(false);
      onSynced?.();
      refreshNotifications();
    }
  };

  const handleStopSync = async () => {
    if (!showSyncing || stopping) return;
    setStopping(true);
    try {
      await api.post('/jobs/sync/stop');
      setSyncBanner({ type: 'info', text: 'Sync process requested to stop.' });
    } catch (err) {
      setSyncBanner({
        type: 'error',
        text: err.response?.data?.error || 'Could not stop sync.',
      });
      setStopping(false);
      return;
    }
    if (!syncing) {
      setTimeout(() => onSynced?.(), 1000);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: Zap },
    { id: 'applications', label: 'Applications', icon: Briefcase },
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'emails', label: 'Processed Emails', icon: Mail },
    { id: 'aliases', label: 'Role Aliases', icon: Sliders },
    { id: 'ai-providers', label: 'AI Providers', icon: Cpu },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="relative flex min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      {/* Ambient background glow accents */}
      <div className="pointer-events-none fixed -top-40 right-0 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none fixed top-1/2 -left-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation — fixed at every breakpoint so it never scrolls
          with the page; its own nav list scrolls independently while the
          logo header (top) and user/logout footer (bottom) stay pinned. */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex h-screen w-64 flex-col border-r border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Logo Section */}
        <div className="flex h-16 items-center justify-between border-b border-[var(--border)] px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 text-white shadow-md shadow-indigo-500/25">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)]">
                Eye<span className="text-indigo-500">O</span>Job
              </span>
              <span className="ml-2 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-500">
                PRO
              </span>
            </div>
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sync Status Mini Card */}
        <div className="p-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background-alt)]/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Gmail Engine
              </span>
              <span
                className={`flex h-2 w-2 rounded-full ${
                  showSyncing
                    ? 'animate-ping bg-amber-400'
                    : 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                }`}
              />
            </div>
            <p className="mt-1 text-xs font-medium text-[var(--text-secondary)] truncate">
              {showSyncing ? 'Syncing mail pipeline...' : 'Engine active & ready'}
            </p>
          </div>
        </div>

        {/* Navigation links — the only part of the sidebar that scrolls */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--background-alt)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon
                  className={`h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-105 ${
                    isActive ? 'text-white' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Account / Footer */}
        <div className="border-t border-[var(--border)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 font-display text-xs font-bold text-white shadow-sm">
                {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                  {user?.name || user?.email?.split('@')[0] || 'Member'}
                </p>
                <p className="truncate text-[10px] text-[var(--text-muted)]">
                  {user?.email || 'Logged in'}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="Log out"
              className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-rose-500/10 hover:text-rose-500"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area — offset by the fixed sidebar's width on desktop */}
      <div className="flex flex-1 flex-col overflow-x-hidden lg:ml-64">
        {/* Top App Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)]/80 px-3 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="shrink-0 rounded-xl border border-[var(--border)] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-bold capitalize text-[var(--text-primary)] sm:text-lg">
                {activeTab === 'overview' ? 'Dashboard Overview' : activeTab}
              </h1>
            </div>
          </div>

          {/* Action Tools — button labels collapse to icon-only below `sm`
              (~640px) so this row never overflows on a 320–360px phone;
              the label reappears at `sm` and up. */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            {syncBanner && (
              <span
                className="hidden text-xs font-medium md:inline-block"
                style={{
                  color:
                    syncBanner.type === 'error'
                      ? 'var(--danger)'
                      : syncBanner.type === 'info'
                      ? 'var(--info)'
                      : 'var(--success)',
                }}
              >
                {syncBanner.text}
              </span>
            )}

            {/* In-App Notifications Bell */}
            <NotificationBell onSelectApplication={onSelectApplication} />

            {/* Sync Jobs Button */}
            <Button
              variant="primary"
              size="sm"
              onClick={handleSyncJobs}
              disabled={showSyncing}
              icon={RefreshCw}
              title={showSyncing ? 'Syncing...' : 'Sync Gmail'}
              className={`px-2.5 sm:px-3 ${showSyncing ? '[&_svg]:animate-spin' : ''}`}
            >
              <span className="hidden sm:inline">{showSyncing ? 'Syncing...' : 'Sync Gmail'}</span>
            </Button>

            {/* Stop Syncing Button (shown during active sync) */}
            {showSyncing && (
              <Button
                variant="dangerGhost"
                size="sm"
                onClick={handleStopSync}
                disabled={stopping}
                icon={Square}
                title={stopping ? 'Stopping...' : 'Stop'}
                className="px-2.5 sm:px-3"
              >
                <span className="hidden sm:inline">{stopping ? 'Stopping...' : 'Stop'}</span>
              </Button>
            )}

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] shadow-[var(--shadow-xs)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
            </button>
          </div>
        </header>

        {/* Main Body — the content column widens in a few extra steps on
            large/4K/ultrawide displays (see @theme in index.css) instead of
            staying capped at 1280px forever, but still never goes full-bleed
            so line lengths and card grids stay readable at 5K+. */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl 3xl:max-w-[100rem] 4xl:max-w-[120rem] 5xl:max-w-[130rem]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
