import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Waves, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

export default function AuthLayout() {
  const { isDark, toggleTheme } = useTheme();
  const { t } = useLanguage();
  return (
    <div className="auth-shell">
      <header className="flex items-center justify-between p-4 max-w-7xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2 text-slate-900 dark:text-white">
          <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center">
            <Waves className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <span className="font-bold text-sm">FloodMonitor</span>
        </Link>
        <button type="button" onClick={toggleTheme} aria-label={t(isDark ? 'action_light_mode' : 'action_dark_mode')}
          className="p-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors">
          {isDark ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Outlet />
      </main>

      <footer className="text-center p-4 text-slate-500 text-xs">
        © {new Date().getFullYear()} FloodMonitor — {t('app_tagline')}
      </footer>
    </div>
  );
}
