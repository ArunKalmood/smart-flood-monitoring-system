import React, { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Waves, Menu, X, Sun, Moon, Bell, LogIn } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/public-info', label: 'Public Info' },
  { to: '/volunteer-register', label: 'Volunteer' },
  { to: '/dashboard', label: 'Dashboard' },
];

export default function PublicLayout() {
  const { isDark, toggleTheme } = useTheme();
  const { isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <Waves className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-slate-800 dark:text-white text-sm">FloodMonitor</span>
              <span className="hidden sm:inline text-slate-400 text-xs ml-1">AI Early Warning</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(l => (
              <Link key={l.to} to={l.to} className="px-4 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all">
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn-primary py-2 px-4 text-xs">
                Dashboard
              </Link>
            ) : (
              <Link to="/login" className="btn-primary py-2 px-4 text-xs">
                <LogIn className="w-3 h-3" /> Sign In
              </Link>
            )}
            <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden md:hidden border-t border-slate-200 dark:border-slate-800"
            >
              <nav className="p-3 space-y-1">
                {NAV_LINKS.map(l => (
                  <Link key={l.to} to={l.to} onClick={() => setMobileOpen(false)}
                    className="block px-4 py-2.5 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                    {l.label}
                  </Link>
                ))}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-slate-900 dark:bg-slate-950 text-slate-400 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Waves className="w-5 h-5 text-blue-400" />
                <span className="font-bold text-white text-sm">FloodMonitor</span>
              </div>
              <p className="text-xs text-slate-500">AI-Powered Flood Monitoring and Early Warning System</p>
            </div>
            <div>
              <h4 className="text-white font-medium text-sm mb-2">Navigation</h4>
              <ul className="space-y-1 text-xs">
                {NAV_LINKS.map(l => <li key={l.to}><Link to={l.to} className="hover:text-white transition-colors">{l.label}</Link></li>)}
              </ul>
            </div>
            <div>
              <h4 className="text-white font-medium text-sm mb-2">Emergency</h4>
              <ul className="space-y-1 text-xs">
                <li>NDRF: <strong className="text-white">011-23438091</strong></li>
                <li>Ambulance: <strong className="text-white">108</strong></li>
                <li>Police: <strong className="text-white">100</strong></li>
                <li>Disaster Mgmt: <strong className="text-white">1078</strong></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-medium text-sm mb-2">Links</h4>
              <ul className="space-y-1 text-xs">
                <li><Link to="/login" className="hover:text-white">Sign In</Link></li>
                <li><Link to="/register" className="hover:text-white">Register</Link></li>
                <li><Link to="/admin/login" className="hover:text-white">Admin Login</Link></li>
                <li><Link to="/public-info" className="hover:text-white">Safety Guide</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-4 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} FloodMonitor — Smart Flood Monitoring &amp; Early Warning System. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
