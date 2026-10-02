import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function StatCard({ title, value, unit, icon: Icon, color = 'blue', trend, trendLabel, subtitle, loading }) {
  const colorMap = {
    blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',   icon: 'text-blue-600 dark:text-blue-400',   border: 'border-blue-200 dark:border-blue-800/50' },
    green:  { bg: 'bg-green-50 dark:bg-green-900/20',  icon: 'text-green-600 dark:text-green-400',  border: 'border-green-200 dark:border-green-800/50' },
    red:    { bg: 'bg-red-50 dark:bg-red-900/20',      icon: 'text-red-600 dark:text-red-400',      border: 'border-red-200 dark:border-red-800/50' },
    amber:  { bg: 'bg-amber-50 dark:bg-amber-900/20',  icon: 'text-amber-600 dark:text-amber-400',  border: 'border-amber-200 dark:border-amber-800/50' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/20',icon: 'text-purple-600 dark:text-purple-400',border: 'border-purple-200 dark:border-purple-800/50' },
    teal:   { bg: 'bg-teal-50 dark:bg-teal-900/20',    icon: 'text-teal-600 dark:text-teal-400',    border: 'border-teal-200 dark:border-teal-800/50' },
  };
  const c = colorMap[color] || colorMap.blue;

  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? 'text-green-500' : trend < 0 ? 'text-red-500' : 'text-slate-400';

  if (loading) {
    return (
      <div className="glass-card p-5">
        <div className="skeleton h-4 w-24 mb-4" />
        <div className="skeleton h-8 w-16 mb-2" />
        <div className="skeleton h-3 w-20" />
      </div>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ duration: 0.2 }}
      className={`glass-card p-5 border ${c.border}`}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{title}</p>
        {Icon && (
          <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${c.icon}`} />
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-2xl font-bold text-slate-800 dark:text-white">
          {value !== undefined && value !== null ? value : '—'}
        </span>
        {unit && <span className="text-sm text-slate-500 dark:text-slate-400">{unit}</span>}
      </div>
      {(trend !== undefined || trendLabel || subtitle) && (
        <div className="flex items-center gap-1">
          {trend !== undefined && <TrendIcon className={`w-3 h-3 ${trendColor}`} />}
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {trendLabel || subtitle}
          </span>
        </div>
      )}
    </motion.div>
  );
}
