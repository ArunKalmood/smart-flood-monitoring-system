import React from 'react';
import { Inbox } from 'lucide-react';

/** Shown instead of a chart/list when the API returned nothing. Never invent data. */
export default function EmptyState({ icon: Icon = Inbox, title, message, className = '', compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center text-slate-400 ${compact ? 'py-6' : 'py-10'} ${className}`}>
      <Icon className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} mb-2 opacity-50`} aria-hidden="true" />
      {title && <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>}
      {message && <p className="text-xs mt-1 max-w-xs">{message}</p>}
    </div>
  );
}
