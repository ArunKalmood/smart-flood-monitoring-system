import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Waves, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function AuthLayout() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-4 max-w-7xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2 text-white">
          <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center">
            <Waves className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-sm">FloodMonitor</span>
        </Link>
        <button onClick={toggleTheme} className="p-2 text-slate-300 hover:text-white transition-colors">
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="text-center p-4 text-slate-500 text-xs">
        © {new Date().getFullYear()} FloodMonitor — Smart Flood Monitoring &amp; Early Warning System
      </footer>
    </div>
  );
}
