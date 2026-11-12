import React from 'react';

export default function PageHeader({ icon: Icon, iconClass = 'text-blue-500', title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          {Icon && <Icon className={`w-5 h-5 ${iconClass}`} aria-hidden="true" />} {title}
        </h1>
        {subtitle && <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
