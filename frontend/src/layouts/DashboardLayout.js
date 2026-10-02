import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Radio, Brain, AlertTriangle, Package, Map,
  Home, Users, MessageSquare, Bell, FileText, User, Settings,
  LogOut, Menu, ChevronLeft, Sun, Moon, Waves, Shield,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '../context/LanguageContext';

// labelKey maps to LanguageContext translation keys
const allNavItems = [
  { path: '/dashboard',             labelKey: 'nav_dashboard',   icon: LayoutDashboard, roles: ['all'] },
  { path: '/dashboard/sensors',     labelKey: 'nav_sensors',     icon: Radio,           roles: ['all'] },
  { path: '/dashboard/predictions', labelKey: 'nav_predictions', icon: Brain,           roles: ['all'] },
  { path: '/dashboard/sos',         labelKey: 'nav_sos',         icon: AlertTriangle,   roles: ['all'] },
  { path: '/dashboard/resources',   labelKey: 'nav_resources',   icon: Package,         roles: ['admin', 'government_authority', 'super_admin', 'district_admin', 'operations'] },
  { path: '/dashboard/routes',      labelKey: 'nav_routes',      icon: Map,             roles: ['all'] },
  { path: '/dashboard/evacuation',  labelKey: 'nav_evacuation',  icon: Home,            roles: ['admin', 'government_authority', 'super_admin', 'district_admin', 'operations'] },
  { path: '/dashboard/volunteers',  labelKey: 'nav_volunteers',  icon: Users,           roles: ['admin', 'government_authority', 'super_admin', 'district_admin'] },
  { path: '/dashboard/feedback',    labelKey: 'nav_feedback',    icon: MessageSquare,   roles: ['all'] },
  { path: '/dashboard/notifications',labelKey:'nav_notifications',icon: Bell,           roles: ['all'] },
  { path: '/dashboard/reports',     labelKey: 'nav_reports',     icon: FileText,        roles: ['admin', 'government_authority', 'super_admin', 'district_admin', 'analyst'] },
  { path: '/dashboard/profile',     labelKey: 'nav_profile',     icon: User,            roles: ['all'] },
  { path: '/dashboard/settings',    labelKey: 'nav_settings',    icon: Settings,        roles: ['all'] },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const { user, logout, isAdmin } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { unreadCount } = useNotifications();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const userRole = user?.role || '';
  const navItems = allNavItems.filter(item =>
    item.roles.includes('all') || item.roles.includes(userRole)
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
          <Waves className="w-5 h-5 text-white" />
        </div>
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden"
            >
              <span className="font-bold text-slate-800 dark:text-white text-sm whitespace-nowrap">FloodMonitor</span>
              <p className="text-xs text-slate-500 dark:text-slate-400">Smart Early Warning</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          const label  = t(item.labelKey);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileSidebar(false)}
              className={`sidebar-link ${active ? 'active' : ''}`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <AnimatePresence>
                {sidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="text-sm whitespace-nowrap overflow-hidden"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
              {item.labelKey === 'nav_notifications' && unreadCount > 0 && sidebarOpen && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User info & logout */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-700">
        <div className={`flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-slate-700/50 ${sidebarOpen ? '' : 'justify-center'}`}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
            {(user?.full_name || user?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden flex-1 min-w-0"
              >
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                  {user?.full_name || user?.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 capitalize truncate">
                  {user?.role?.replace('_', ' ')}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          {sidebarOpen && (
            <button onClick={logout} className="text-slate-400 hover:text-red-500 transition-colors ml-auto">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: sidebarOpen ? 240 : 68 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="hidden lg:flex flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 relative z-20 flex-shrink-0"
      >
        <SidebarContent />
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors z-30"
        >
          <motion.div animate={{ rotate: sidebarOpen ? 0 : 180 }}>
            <ChevronLeft className="w-3 h-3 text-slate-500" />
          </motion.div>
        </button>
      </motion.aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setMobileSidebar(false)}
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 h-full w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-50 lg:hidden"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top navbar */}
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 h-14 flex items-center justify-between flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebar(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Menu className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
              <span>Dashboard</span>
              {location.pathname !== '/dashboard' && (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <span className="text-slate-700 dark:text-slate-200 font-medium capitalize">
                    {location.pathname.split('/').pop()?.replace('-', ' ')}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-400"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications */}
            <button
              onClick={() => navigate('/dashboard/notifications')}
              className="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-400"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse-slow" />
              )}
            </button>

            {/* Role badge */}
            {isAdmin && (
              <span className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium">
                <Shield className="w-3 h-3" /> {t('admin')}
              </span>
            )}

            {/* Landing link */}
            <Link to="/" className="hidden sm:block text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {t('public_site')}
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
