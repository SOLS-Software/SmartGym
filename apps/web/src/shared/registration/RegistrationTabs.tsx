'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface RegistrationTabsProps {
  tabs: Array<{ key: string; label: string }>;
  activeTab: string;
  onTabChange: (key: string) => void;
  icons?: Record<string, LucideIcon>;
  ariaLabel?: string;
}

export function RegistrationTabs({ tabs, activeTab, onTabChange, icons, ariaLabel }: RegistrationTabsProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <section
      className={`company-child-tabs${isCollapsed ? ' tabs-collapsed' : ''}`}
      aria-label={ariaLabel}
    >
      <button
        aria-label={isCollapsed ? 'Expandir abas' : 'Recolher abas'}
        className="tabs-toggle-btn"
        onClick={() => setIsCollapsed((c) => !c)}
        type="button"
      >
        {isCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      <div className="company-child-tabs-list" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const Icon = icons?.[tab.key];
          return (
            <button
              key={tab.key}
              aria-selected={activeTab === tab.key}
              className={activeTab === tab.key ? 'active' : ''}
              onClick={() => onTabChange(tab.key)}
              role="tab"
              title={tab.label}
              type="button"
            >
              {Icon
                ? <Icon size={16} />
                : <span aria-hidden="true" className="tab-abbr">{tab.label.slice(0, 2).toUpperCase()}</span>
              }
              <span className="tab-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
