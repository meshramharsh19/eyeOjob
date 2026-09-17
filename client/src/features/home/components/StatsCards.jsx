import React from 'react';
import {
  Briefcase,
  Send,
  Calendar,
  Award,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { StatsCard } from '../../../shared/ui';

const STATS_CONFIG = [
  {
    key: 'total',
    label: 'Total Applications',
    icon: Briefcase,
    color: 'var(--primary)',
    glow: true,
  },
  {
    key: 'applied',
    label: 'Applied',
    icon: Send,
    color: 'var(--status-applied)',
  },
  {
    key: 'interview',
    label: 'Interviews',
    icon: Calendar,
    color: 'var(--status-interview)',
  },
  {
    key: 'offers',
    label: 'Job Offers',
    icon: Award,
    color: 'var(--status-offer)',
    glow: true,
  },
  {
    key: 'rejected',
    label: 'Rejected',
    icon: XCircle,
    color: 'var(--status-rejected)',
  },
  {
    key: 'needs_review',
    label: 'Needs Review',
    icon: AlertCircle,
    color: 'var(--purple)',
  },
];

export const StatsCards = ({ stats, onCardClick }) => {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 sm:gap-4">
      {STATS_CONFIG.map(({ key, label, icon: Icon, color, glow }) => (
        <StatsCard
          key={key}
          title={label}
          value={stats[key] ?? 0}
          icon={Icon}
          color={color}
          glow={glow && (stats[key] ?? 0) > 0}
          onClick={onCardClick ? () => onCardClick(key) : undefined}
        />
      ))}
    </div>
  );
};

export default StatsCards;
