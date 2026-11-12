import React from 'react';
import { motion } from 'framer-motion';

const COLORS = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',     icon: 'text-blue-600 dark:text-blue-400',     border: 'border-blue-200 dark:border-blue-800/50' },
  green:  { bg: 'bg-green-50 dark:bg-green-900/20',   icon: 'text-green-600 dark:text-green-400',   border: 'border-green-200 dark:border-green-800/50' },
  red:    { bg: 'bg-red-50 dark:bg-red-900/20',       icon: 'text-red-600 dark:text-red-400',       border: 'border-red-200 dark:border-red-800/50' },
  amber:  { bg: 'bg-amber-50 dark:bg-amber-900/20',   icon: 'text-amber-600 dark:text-amber-400',   border: 'border-amber-200 dark:border-amber-800/50' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', icon: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800/50' },
  teal:   { bg: 'bg-teal-50 dark:bg-teal-900/20',     icon: 'text-teal-600 dark:text-teal-400',     border: 'border-teal-200 dark:border-teal-800/50' },
  slate:  { bg: 'bg-slate-100 dark:bg-slate-700/50',  icon: 'text-slate-500 dark:text-slate-400',   border: 'border-slate-200 dark:border-slate-700' },
};

/** A metric tile. `value` null/undefined renders "—" (no invented numbers). */
export default function StatCard({ title, value, unit, icon: Icon, color = 'blue', subtitle, loading }) {
  const c = COLORS[color] || COLORS.blue;
  if (loading) {
    return (
      <div className="glass-card p-5" aria-busy="true">
        <div className="skeleton h-4 w-24 mb-4" />
        <div className="skeleton h-8 w-16 mb-2" />
        <div className="skeleton h-3 w-20" />
      </div>
    );
  }
  const missing = value === undefined || value === null || value === '';
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }} className={`glass-card p-5 border ${c.border}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{title}</p>
        {Icon && (
          <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${c.icon}`} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-2xl font-bold text-slate-800 dark:text-white">{missing ? '—' : value}</span>
        {unit && !missing && <span className="text-sm text-slate-500 dark:text-slate-400">{unit}</span>}
      </div>
      {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </motion.div>
  );
}
