import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCircle, Trash2, BellOff, RefreshCw } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { useLanguage } from '../../context/LanguageContext';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import { formatDateTime, formatRelative } from '../../utils/datetime';

const TYPE_STYLES = {
  flood_warning: { emoji: '🌊', cls: 'bg-blue-100 dark:bg-blue-900/30' },
  sos_update: { emoji: '🆘', cls: 'bg-red-100 dark:bg-red-900/30' },
  volunteer_assigned: { emoji: '👥', cls: 'bg-green-100 dark:bg-green-900/30' },
  shelter_available: { emoji: '🏠', cls: 'bg-purple-100 dark:bg-purple-900/30' },
  weather_alert: { emoji: '⛈️', cls: 'bg-amber-100 dark:bg-amber-900/30' },
  general: { emoji: '🔔', cls: 'bg-slate-100 dark:bg-slate-700' },
};

export default function Notifications() {
  const { notifications, total, unreadCount, loaded, markRead, markAllRead, removeNotification, fetchNotifications } = useNotifications();
  const { t } = useLanguage();
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(null); // id (or 'all') of the action in flight

  const run = async (key, action) => {
    setBusy(key);
    await action();
    setBusy(null);
  };

  const shown = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;

  return (
    <div className="page-container max-w-3xl">
      <PageHeader icon={Bell} title={t('notif_title')}
        subtitle={unreadCount > 0 ? t('notif_unread_count', { count: unreadCount }) : t('notif_all_caught_up')}>
        <button type="button" onClick={() => run('refresh', fetchNotifications)} aria-label={t('action_refresh')}
          disabled={busy === 'refresh'} className="btn-ghost text-xs py-2 px-3">
          <RefreshCw className={`w-3 h-3 ${busy === 'refresh' ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
        {unreadCount > 0 && (
          <button type="button" onClick={() => run('all', markAllRead)} disabled={busy === 'all'} className="btn-outline text-xs py-2 px-3">
            <CheckCircle className="w-3 h-3" aria-hidden="true" /> {t('notif_mark_all_read')}
          </button>
        )}
      </PageHeader>

      <div className="flex gap-2 mb-4" role="tablist" aria-label={t('notif_filter')}>
        {[
          { key: 'all', label: t('notif_tab_all', { count: total }) },
          { key: 'unread', label: t('notif_tab_unread', { count: unreadCount }) },
        ].map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filter === f.key ? 'bg-blue-600 text-white shadow-sm' : 'glass-card text-slate-600 dark:text-slate-400 hover:text-slate-800'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="glass-card">
          <EmptyState icon={BellOff}
            title={t(filter === 'unread' ? 'notif_none_unread' : 'notif_none')}
            message={unreadCount === 0 ? t('notif_all_caught_up') : undefined} />
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((n, i) => {
            const style = TYPE_STYLES[n.type] || TYPE_STYLES.general;
            return (
              <motion.li key={n.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className={`glass-card p-4 flex items-start gap-4 border-l-4 ${n.is_read ? 'border-transparent' : 'border-blue-500'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${style.cls}`} aria-hidden="true">{style.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold ${n.is_read ? 'text-slate-600 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                      {n.title}
                      {!n.is_read && <span className="sr-only"> ({t('notif_unread')})</span>}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!n.is_read && (
                        <button type="button" onClick={() => run(n.id, () => markRead(n.id))} disabled={busy === n.id}
                          aria-label={t('notif_mark_read')} title={t('notif_mark_read')}
                          className="p-1 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600">
                          <CheckCircle className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                      <button type="button" onClick={() => run(n.id, () => removeNotification(n.id))} disabled={busy === n.id}
                        aria-label={t('action_delete')} title={t('action_delete')}
                        className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500">
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{n.message}</p>
                  <p className="text-xs text-slate-500 mt-1" title={formatDateTime(n.created_at)}>{formatRelative(n.created_at)}</p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
