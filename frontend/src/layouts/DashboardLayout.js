import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, Menu, ChevronLeft, Sun, Moon, Waves, Shield, ChevronRight,
  Bell, Globe, Check, ExternalLink
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '../context/LanguageContext';
import { pageFor, pagesFor } from '../config/navigation';
import { dashboardAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import { getDataFreshness, FRESHNESS_STATES } from '../utils/dataFreshness';
import { formatRelative } from '../utils/datetime';

const TELEMETRY_POLL_MS = 60000;

function NavRail({ expanded, onNavigate }) {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const { t } = useLanguage();
  const location = useLocation();
  const name = user?.full_name || user?.name || '';
  const initial = (name || '?').charAt(0).toUpperCase();

  return (
    <div className="flex flex-col h-full select-none">
      {/* Brand Header */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-[#1E3A5F]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 via-cyan-600 to-blue-800 flex items-center justify-center flex-shrink-0 shadow-lg shadow-cyan-500/20">
          <Waves className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-800 dark:text-white text-sm tracking-wide">
                  FloodMonitor
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 border border-cyan-500/20">
                  Twin
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {t('cmd_center')}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label={t('nav_main')}>
        {pagesFor(user).map((item) => {
          const active =
            location.pathname === item.path ||
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path + '/'));
          const label = t(item.labelKey);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              title={expanded ? undefined : label}
              className={`relative group flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium tracking-wide transition-all ${
                active
                  ? 'bg-blue-600/15 dark:bg-cyan-500/15 text-blue-600 dark:text-cyan-400 font-semibold border-l-2 border-blue-600 dark:border-cyan-400 shadow-[inset_0_0_12px_rgba(34,211,238,0.08)]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#102238]/70'
              }`}
            >
              <item.icon
                className={`w-4 h-4 flex-shrink-0 transition-transform ${
                  active ? 'scale-110 text-blue-600 dark:text-cyan-400' : 'group-hover:scale-105'
                }`}
                aria-hidden="true"
              />
              {expanded ? (
                <span className="truncate whitespace-nowrap">{label}</span>
              ) : (
                <span className="sr-only">{label}</span>
              )}
              {item.labelKey === 'nav_notifications' && unreadCount > 0 && expanded && (
                <span
                  className="ml-auto bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center shadow-sm"
                  aria-label={t('notif_unread_count', { count: unreadCount })}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Section at rail bottom */}
      <div className="p-3 border-t border-slate-200 dark:border-[#1E3A5F]">
        <div
          className={`flex items-center gap-2.5 p-2 rounded-xl bg-slate-100/80 dark:bg-[#102238] border border-slate-200/60 dark:border-[#1E3A5F]/70 ${
            expanded ? '' : 'justify-center'
          }`}
        >
          <div
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold shadow-sm"
            aria-hidden="true"
          >
            {initial}
          </div>
          {expanded && (
            <div className="overflow-hidden flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                {name}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {user?.role ? t(`role_${user.role}`) : ''}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            aria-label={t('auth_logout')}
            title={t('auth_logout')}
            className={`p-1 text-slate-400 hover:text-rose-500 transition-colors ${expanded ? 'ml-auto' : ''}`}
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [telemetry, setTelemetry] = useState(null);

  const langRef = useRef(null);
  const notifRef = useRef(null);

  const { user, isAdmin, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const { language, setLanguage, languages, t } = useLanguage();
  const location = useLocation();
  const current = pageFor(location.pathname);

  // Telemetry polling: single call at layout level for real system freshness
  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await dashboardAPI.getStats();
      setTelemetry(res.data);
    } catch {
      // Telemetry stays null or previous on connection failure
    }
  }, []);

  usePolling(fetchTelemetry, TELEMETRY_POLL_MS);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (langRef.current && !langRef.current.contains(e.target)) {
        setLangMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute real data freshness
  const freshness = getDataFreshness(telemetry);

  // Telemetry pill display styles
  let statusBadgeClass = 'dt-status-nodata';
  let dotClass = 'bg-slate-400';
  let statusTextKey = 'telemetry_no_data';

  if (freshness.status === FRESHNESS_STATES.LIVE) {
    statusBadgeClass = 'dt-status-live';
    dotClass = 'bg-emerald-400 animate-pulse';
    statusTextKey = 'telemetry_live';
  } else if (freshness.status === FRESHNESS_STATES.STALE) {
    statusBadgeClass = 'dt-status-stale';
    dotClass = 'bg-amber-400';
    statusTextKey = 'telemetry_stale';
  } else if (freshness.status === FRESHNESS_STATES.OFFLINE) {
    statusBadgeClass = 'dt-status-offline';
    dotClass = 'bg-rose-400';
    statusTextKey = 'telemetry_offline';
  }

  const currentLangObj = languages.find((l) => l.code === language) || languages[0];
  const userName = user?.full_name || user?.name || '';

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#07111F] text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
      {/* Desktop Navigation Rail */}
      <motion.aside
        animate={{ width: sidebarOpen ? 240 : 72 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="hidden lg:flex flex-col bg-white/95 dark:bg-[#0B1728]/95 backdrop-blur-md border-r border-slate-200 dark:border-[#1E3A5F] relative z-20 flex-shrink-0"
      >
        <NavRail expanded={sidebarOpen} />
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={t(sidebarOpen ? 'action_collapse_sidebar' : 'action_expand_sidebar')}
          aria-expanded={sidebarOpen}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-white dark:bg-[#102238] border border-slate-300 dark:border-[#1E3A5F] flex items-center justify-center shadow-md hover:border-cyan-400 transition-colors z-30 text-slate-500 dark:text-slate-400"
        >
          <motion.div animate={{ rotate: sidebarOpen ? 0 : 180 }}>
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          </motion.div>
        </button>
      </motion.aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileSidebar(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed left-0 top-0 h-full w-64 bg-white dark:bg-[#0B1728] border-r border-slate-200 dark:border-[#1E3A5F] z-50 lg:hidden shadow-2xl"
            >
              <NavRail expanded onNavigate={() => setMobileSidebar(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Command Viewport */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Command Header */}
        <header className="bg-white/90 dark:bg-[#0B1728]/90 backdrop-blur-md border-b border-slate-200 dark:border-[#1E3A5F] px-4 h-14 flex items-center justify-between flex-shrink-0 z-10 gap-3">
          {/* Left: Mobile Toggle + Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebar(true)}
              aria-label={t('action_open_menu')}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#102238] transition-colors text-slate-600 dark:text-slate-300"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <nav
              aria-label={t('nav_breadcrumb')}
              className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate"
            >
              <Link
                to="/dashboard"
                className="hover:text-blue-600 dark:hover:text-cyan-400 transition-colors font-medium"
              >
                {t('nav_dashboard')}
              </Link>
              {(() => {
                const isSettingsSubPage = location.pathname.startsWith('/dashboard/settings/');
                const settingsSubSlug = isSettingsSubPage ? location.pathname.split('/')[3] : null;
                const SETTINGS_SUB_KEYS = {
                  account: 'settings_nav_account',
                  security: 'settings_nav_security',
                  notifications: 'settings_nav_notifications',
                  appearance: 'settings_nav_appearance',
                  privacy: 'settings_nav_privacy',
                  audit: 'settings_nav_audit',
                };
                const settingsSubKey = settingsSubSlug ? SETTINGS_SUB_KEYS[settingsSubSlug] : null;

                if (isSettingsSubPage && settingsSubKey) {
                  return (
                    <>
                      <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" aria-hidden="true" />
                      <Link
                        to="/dashboard/settings"
                        className="hover:text-blue-600 dark:hover:text-cyan-400 transition-colors font-medium truncate"
                      >
                        {t('nav_settings')}
                      </Link>
                      <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" aria-hidden="true" />
                      <span
                        className="text-slate-800 dark:text-slate-200 font-semibold truncate"
                        aria-current="page"
                      >
                        {t(settingsSubKey)}
                      </span>
                    </>
                  );
                }

                if (current && current.path !== '/dashboard') {
                  return (
                    <>
                      <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" aria-hidden="true" />
                      <span
                        className="text-slate-800 dark:text-slate-200 font-semibold truncate"
                        aria-current="page"
                      >
                        {t(current.labelKey)}
                      </span>
                    </>
                  );
                }

                return null;
              })()}
            </nav>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Real Data Freshness Status Pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide ${statusBadgeClass}`}
              title={
                freshness.recordedAt
                  ? `${t('dash_data_as_of', { time: formatRelative(freshness.recordedAt) })}`
                  : t('status_no_data')
              }
            >
              <span className={`w-2 h-2 rounded-full ${dotClass}`} aria-hidden="true" />
              <span className="hidden sm:inline font-mono">{t(statusTextKey)}</span>
              {freshness.status === FRESHNESS_STATES.STALE && freshness.ageMinutes !== null && (
                <span className="text-[10px] opacity-80 font-mono">
                  ({Math.round(freshness.ageMinutes)}m)
                </span>
              )}
            </div>

            {/* Language Selector Dropdown */}
            <div className="relative" ref={langRef}>
              <button
                type="button"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                aria-label={t('action_switch_language')}
                aria-expanded={langMenuOpen}
                className="flex items-center gap-1 p-2 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 dark:border-[#1E3A5F] hover:bg-slate-100 dark:hover:bg-[#102238] transition-colors text-slate-600 dark:text-slate-300 text-xs"
              >
                <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline font-medium uppercase">{currentLangObj.code}</span>
              </button>

              <AnimatePresence>
                {langMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute right-0 mt-2 w-40 rounded-xl bg-white dark:bg-[#102238] border border-slate-200 dark:border-[#1E3A5F] shadow-xl py-1 z-50 text-xs"
                  >
                    {languages.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => {
                          setLanguage(l.code);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                          language === l.code
                            ? 'text-cyan-500 font-semibold bg-cyan-500/5'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span>{l.nativeLabel}</span>
                        {language === l.code && <Check className="w-3.5 h-3.5 text-cyan-500" aria-hidden="true" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Notifications Popover */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifMenuOpen(!notifMenuOpen)}
                aria-label={
                  unreadCount > 0
                    ? t('notif_bell_unread', { count: unreadCount })
                    : t('nav_notifications')
                }
                aria-expanded={notifMenuOpen}
                className="relative p-2 rounded-xl border border-slate-200 dark:border-[#1E3A5F] hover:bg-slate-100 dark:hover:bg-[#102238] transition-colors text-slate-600 dark:text-slate-300"
              >
                <Bell className="w-4 h-4" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-rose-500 text-white rounded-full text-[10px] font-bold leading-4 text-center shadow-sm"
                    aria-hidden="true"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notifMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl bg-white dark:bg-[#102238] border border-slate-200 dark:border-[#1E3A5F] shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-[#1E3A5F] bg-slate-50/70 dark:bg-[#0B1728]/70">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-800 dark:text-white">
                          {t('notif_title')}
                        </span>
                        {unreadCount > 0 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-500 dark:text-rose-400">
                            {unreadCount}
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={() => markAllRead()}
                          className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline"
                        >
                          {t('notif_mark_all_read')}
                        </button>
                      )}
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                      {notifications && notifications.length > 0 ? (
                        notifications.slice(0, 4).map((n) => (
                          <div
                            key={n.id}
                            className={`p-3 text-xs transition-colors ${
                              !n.read
                                ? 'bg-blue-50/40 dark:bg-cyan-950/20 text-slate-900 dark:text-slate-100'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <p className="font-semibold truncate">{n.title || n.message}</p>
                            {n.title && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>}
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">
                              {formatRelative(n.created_at)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-xs text-slate-400 dark:text-slate-500">
                          {t('notif_none')}
                        </div>
                      )}
                    </div>

                    <div className="p-2.5 border-t border-slate-200 dark:border-[#1E3A5F] bg-slate-50/50 dark:bg-[#0B1728]/50 text-center">
                      <Link
                        to="/dashboard/notifications"
                        onClick={() => setNotifMenuOpen(false)}
                        className="text-xs font-medium text-blue-600 dark:text-cyan-400 hover:underline"
                      >
                        {t('action_view_all_notifications')}
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={t(isDark ? 'action_light_mode' : 'action_dark_mode')}
              className="p-2 rounded-xl border border-slate-200 dark:border-[#1E3A5F] hover:bg-slate-100 dark:hover:bg-[#102238] transition-colors text-slate-600 dark:text-slate-300"
            >
              {isDark ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
            </button>

            {/* Admin Shield Badge */}
            {isAdmin && (
              <span className="hidden md:flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-cyan-300 border border-blue-200 dark:border-blue-700/50 text-[11px] font-semibold">
                <Shield className="w-3 h-3 text-cyan-400" aria-hidden="true" /> {t('admin')}
              </span>
            )}

            {/* Public Site Quick Link */}
            <Link
              to="/"
              className="hidden sm:flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 dark:hover:text-cyan-400 transition-colors px-1.5 py-1"
            >
              <span>{t('public_site')}</span>
              <ExternalLink className="w-3 h-3 opacity-70" aria-hidden="true" />
            </Link>

            {/* User Chip */}
            <div className="flex items-center gap-2 pl-1 border-l border-slate-200 dark:border-[#1E3A5F]">
              <div
                className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-sm"
                title={userName}
              >
                {(userName || '?').charAt(0).toUpperCase()}
              </div>
              <button
                type="button"
                onClick={logout}
                aria-label={t('auth_logout')}
                title={t('auth_logout')}
                className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-[#102238]"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        {/* Content Outlet with Shared Telemetry Context */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#07111F] text-slate-900 dark:text-slate-100">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <Outlet context={{ stats: telemetry, freshness, refreshTelemetry: fetchTelemetry }} />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
