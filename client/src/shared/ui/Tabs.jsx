import React from 'react';

export const Tabs = ({
  tabs = [],
  activeTab,
  onChange,
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-1.5 overflow-x-auto rounded-xl bg-[var(--background-alt)]/70 p-1 backdrop-blur-sm border border-[var(--border)] ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`group relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-200 select-none whitespace-nowrap ${
              isActive
                ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]/40'
            }`}
          >
            {Icon && (
              <Icon
                className={`h-4 w-4 transition-colors ${
                  isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                }`}
              />
            )}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== null && (
              <span
                className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  isActive
                    ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                    : 'bg-[var(--border)] text-[var(--text-muted)]'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
