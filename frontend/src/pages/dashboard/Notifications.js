import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCircle, Trash2, BellOff, RefreshCw } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { format } from 'date-fns';

const TYPE_ICONS = {
  flood_warning: { emoji: '🌊', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  sos_accepted: { emoji: '🆘', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  volunteer_assigned: { emoji: '👥', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  shelter_available: { emoji: '🏠', cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  weather_alert: { emoji: '⛈️', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  general: { emoji: '🔔', cls: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' },
};

export default function Notifications() {
  const { notifications, unreadCount, markRead, markAllRead, removeNotification, fetchNotifications } = useNotifications();
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'unread' ? notifications.filter(n => !n.is_read) : notifications;

  const DEMO_NOTIFICATIONS = [
    { id: 1, title: '🌊 Flood Warning Issued', message: 'Red alert: Water level exceeding 8m at Station WL-001. Evacuation required for Zone A.', type: 'flood_warning', is_read: false, created_at: new Date(Date.now() - 600000).toISOString() },
    { id: 2, title: '🆘 SOS Request #12 Accepted', message: 'Emergency team dispatched to Riverside Colony. ETA: 15 minutes.', type: 'sos_accepted', is_read: false, created_at: new Date(Date.now() - 1800000).toISOString() },
    { id: 3, title: '👥 Volunteer Assigned', message: '5 volunteers from Team Alpha assigned to your rescue request.', type: 'volunteer_assigned', is_read: true, created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 4, title: '🏠 Shelter Available', message: 'City Sports Complex now has 120 available spots. Food and medical aid available.', type: 'shelter_available', is_read: true, created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: 5, title: '⛈️ Weather Alert', message: 'Heavy rainfall predicted in District 3-7 for next 48 hours. Maximum intensity: 120mm/h.', type: 'weather_alert', is_read: false, created_at: new Date(Date.now() - 10800000).toISOString() },
  ];

  const display = (notifications.length > 0 ? filtered : DEMO_NOTIFICATIONS.filter(n => filter === 'all' || !n.is_read));

  return (
    <div className="page-container max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-500" /> Notification Center
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread notifications` : 'All caught up!'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchNotifications} className="btn-ghost text-xs py-2 px-3">
            <RefreshCw className="w-3 h-3" />
          </button>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="btn-outline text-xs py-2 px-3">
              <CheckCircle className="w-3 h-3" /> Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'all', label: `All (${notifications.length || DEMO_NOTIFICATIONS.length})` },
          { key: 'unread', label: `Unread (${unreadCount || DEMO_NOTIFICATIONS.filter(n => !n.is_read).length})` },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filter === f.key ? 'bg-blue-600 text-white shadow-sm' : 'glass-card text-slate-600 dark:text-slate-400 hover:text-slate-800'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className="space-y-2">
        {display.length === 0 ? (
          <div className="glass-card p-12 text-center text-slate-400">
            <BellOff className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs mt-1">You're all caught up!</p>
          </div>
        ) : (
          display.map((n, i) => {
            const typeConfig = TYPE_ICONS[n.type] || TYPE_ICONS.general;
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`glass-card p-4 flex items-start gap-4 transition-all border-l-4 ${!n.is_read ? 'border-blue-500' : 'border-transparent'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${typeConfig.cls}`}>
                  {typeConfig.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold ${!n.is_read ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                      {n.title}
                      {!n.is_read && <span className="inline-block w-2 h-2 rounded-full bg-blue-500 ml-2" />}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!n.is_read && (
                        <button onClick={() => markRead(n.id)} title="Mark as read"
                          className="p-1 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 transition-colors">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => removeNotification(n.id)} title="Delete"
                        className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {n.created_at ? format(new Date(n.created_at), 'dd MMM yyyy, HH:mm') : ''}
                  </p>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
