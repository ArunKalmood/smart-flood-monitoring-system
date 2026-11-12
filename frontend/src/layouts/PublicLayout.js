import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import {
  Waves, Menu, X, Sun, Moon, LogIn, Globe, Check, Phone, ArrowUp, Mail,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { TOP_EMERGENCY_NUMBERS } from '../config/emergencyContacts';

const NAV_LINKS = [
  { to: '/', labelKey: 'nav_home' },
  { to: '/public-info', labelKey: 'nav_public_info' },
  { to: '/volunteer-register', labelKey: 'nav_volunteer' },
  { to: '/dashboard', labelKey: 'nav_dashboard' },
];

export default function PublicLayout() {
  const { isDark, toggleTheme } = useTheme();
  const { isAuthenticated, logout } = useAuth();
  const { language, setLanguage, languages, t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [footerLangOpen, setFooterLangOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const langRef = useRef(null);
  const footerLangRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (langRef.current && !langRef.current.contains(e.target)) {
        setLangMenuOpen(false);
      }
      if (footerLangRef.current && !footerLangRef.current.contains(e.target)) {
        setFooterLangOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleScroll() {
      setShowBackToTop(window.scrollY > 300);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const currentLang = languages.find((l) => l.code === language) || languages[0];
  const supportEmail = process.env.REACT_APP_SUPPORT_EMAIL;

  return (
    <div className="min-h-[100dvh] bg-white dark:bg-slate-900 flex flex-col selection:bg-blue-500 selection:text-white">
      {/* Header: compact (<= 56px) on mobile, 64px on desktop */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 min-h-[44px] py-1" aria-label="FloodMonitor Home">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Waves className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
              <span className="font-bold text-slate-800 dark:text-white text-base tracking-tight">FloodMonitor</span>
              <span className="hidden lg:inline text-slate-500 text-xs font-normal">{t('app_short_tagline')}</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label={t('nav_main')}>
            {NAV_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="px-3.5 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {t(l.labelKey)}
              </Link>
            ))}
          </nav>

          {/* Right Action Bar */}
          <div className="flex items-center gap-2">
            {/* Desktop Language Selector */}
            <div className="relative hidden md:block" ref={langRef}>
              <button
                type="button"
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                aria-label={t('action_switch_language')}
                aria-expanded={langMenuOpen}
                className="flex items-center gap-1.5 min-h-[44px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300 text-xs font-medium"
              >
                <Globe className="w-4 h-4 text-blue-500" aria-hidden="true" />
                <span>{currentLang.nativeLabel}</span>
              </button>

              <AnimatePresence>
                {langMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute right-0 mt-2 w-44 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl py-1 z-50 text-xs"
                  >
                    {languages.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => {
                          setLanguage(l.code);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                          language === l.code ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-900/20' : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span>{l.nativeLabel}</span>
                        {language === l.code && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Desktop Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={t(isDark ? 'action_light_mode' : 'action_dark_mode')}
              className="hidden md:flex p-2.5 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" /> : <Moon className="w-4 h-4 text-slate-600" aria-hidden="true" />}
            </button>

            {/* Desktop Auth Button */}
            {isAuthenticated ? (
              <Link to="/dashboard" className="hidden md:inline-flex btn-primary py-2 px-4 text-xs">
                {t('nav_dashboard')}
              </Link>
            ) : (
              <Link to="/login" className="hidden md:inline-flex btn-primary py-2 px-4 text-xs items-center gap-1.5">
                <LogIn className="w-3.5 h-3.5" aria-hidden="true" /> {t('auth_sign_in')}
              </Link>
            )}

            {/* Mobile Hamburger Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label={t(mobileOpen ? 'action_close_menu' : 'action_open_menu')}
              className="md:hidden min-h-[44px] min-w-[44px] p-2 flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {mobileOpen ? <X className="w-6 h-6" aria-hidden="true" /> : <Menu className="w-6 h-6" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Mobile Full-Width Menu Sheet with 48px rows */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              id="mobile-nav"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden md:hidden border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl shadow-xl max-h-[calc(100dvh-3.5rem)] overflow-y-auto"
            >
              <nav className="p-3 space-y-1" aria-label={t('nav_main')}>
                {NAV_LINKS.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center min-h-[48px] px-4 rounded-xl text-base font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {t(l.labelKey)}
                  </Link>
                ))}

                {/* Mobile Language Selector Row */}
                <div className="pt-2 pb-1 px-4 border-t border-slate-200/60 dark:border-slate-800/60">
                  <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <Globe className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
                    <span>{t('action_switch_language')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {languages.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => {
                          setLanguage(l.code);
                          setMobileOpen(false);
                        }}
                        className={`flex items-center justify-between min-h-[44px] px-3 rounded-lg text-sm transition-colors ${
                          language === l.code
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span>{l.nativeLabel}</span>
                        {language === l.code && <Check className="w-4 h-4" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mobile Theme Toggle Row (48px) */}
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    setMobileOpen(false);
                  }}
                  className="w-full flex items-center justify-between min-h-[48px] px-4 rounded-xl text-base font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="flex items-center gap-3">
                    {isDark ? <Sun className="w-5 h-5 text-amber-400" aria-hidden="true" /> : <Moon className="w-5 h-5 text-slate-600" aria-hidden="true" />}
                    <span>{t(isDark ? 'action_light_mode' : 'action_dark_mode')}</span>
                  </span>
                </button>

                {/* Mobile Sign In Row (48px) */}
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setMobileOpen(false);
                    }}
                    className="w-full flex items-center gap-3 min-h-[48px] px-4 rounded-xl text-base font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                  >
                    <LogIn className="w-5 h-5 rotate-180" aria-hidden="true" />
                    <span>{t('auth_logout')}</span>
                  </button>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 min-h-[48px] px-4 rounded-xl text-base font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                  >
                    <LogIn className="w-5 h-5" aria-hidden="true" />
                    <span>{t('auth_sign_in')}</span>
                  </Link>
                )}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Rebuilt Product Footer */}
      <footer className="bg-slate-100 text-slate-600 dark:bg-slate-950 dark:text-slate-400 pt-12 pb-16 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            {/* Col 1: Brand & Language */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
                  <Waves className="w-5 h-5" aria-hidden="true" />
                </div>
                <span className="font-bold text-slate-900 dark:text-white text-base">FloodMonitor</span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                {t('footer_brand_desc')}
              </p>
              {/* Language Selector Dropdown in Footer */}
              <div className="relative inline-block" ref={footerLangRef}>
                <button
                  type="button"
                  onClick={() => setFooterLangOpen(!footerLangOpen)}
                  aria-label={t('action_switch_language')}
                  aria-expanded={footerLangOpen}
                  className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:ring-2 focus:ring-blue-500"
                >
                  <Globe className="w-4 h-4 text-blue-500" aria-hidden="true" />
                  <span>{currentLang.nativeLabel}</span>
                </button>
                {footerLangOpen && (
                  <div className="absolute left-0 bottom-full mb-2 w-48 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1 z-50 text-xs">
                    {languages.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => {
                          setLanguage(l.code);
                          setFooterLangOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                          language === l.code ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-900/20' : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span>{l.nativeLabel}</span>
                        {language === l.code && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Col 2: Product Navigation */}
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-sm mb-3">
                {t('footer_navigation')}
              </h2>
              <nav aria-label={t('footer_nav_product')}>
                <ul className="space-y-1 text-sm">
                  <li>
                    <Link to="/" className="inline-flex items-center min-h-[44px] py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
                      {t('nav_home')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/public-info" className="inline-flex items-center min-h-[44px] py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
                      {t('nav_public_info')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/volunteer-register" className="inline-flex items-center min-h-[44px] py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
                      {t('nav_volunteer')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/dashboard" className="inline-flex items-center min-h-[44px] py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
                      {t('nav_dashboard')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/login" className="inline-flex items-center min-h-[44px] py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
                      {t('auth_sign_in')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/register" className="inline-flex items-center min-h-[44px] py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
                      {t('auth_register')}
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>

            {/* Col 3: Emergency Contacts */}
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-sm mb-3">
                {t('footer_emergency')}
              </h2>
              <nav aria-label={t('footer_nav_emergency')}>
                <ul className="space-y-2 text-sm">
                  {TOP_EMERGENCY_NUMBERS.map((c) => (
                    <li key={c.number}>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{t(c.nameKey)}</span>
                      <a
                        href={`tel:${c.number}`}
                        className="inline-flex items-center gap-1.5 min-h-[44px] py-1 font-bold text-slate-900 dark:text-slate-100 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />
                        <span>{c.number}</span>
                      </a>
                    </li>
                  ))}
                  <li className="pt-2">
                    <Link
                      to="/public-info#emergency-contacts"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline min-h-[44px]"
                    >
                      <span>{t('footer_all_contacts')}</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>

            {/* Col 4: Resources */}
            <div>
              <h2 className="text-slate-900 dark:text-white font-bold text-sm mb-3">
                {t('footer_resources')}
              </h2>
              <nav aria-label={t('footer_nav_resources')}>
                <ul className="space-y-1 text-sm">
                  <li>
                    <Link to="/public-info#safety" className="inline-flex items-center min-h-[44px] py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
                      {t('nav_safety')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/public-info#faq" className="inline-flex items-center min-h-[44px] py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
                      {t('nav_faqs')}
                    </Link>
                  </li>
                  <li>
                    <a
                      href="/resources/flood-safety-guide.pdf"
                      download
                      className="inline-flex items-center min-h-[44px] py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors"
                    >
                      {t('footer_safety_guide')} (PDF)
                    </a>
                  </li>
                  <li>
                    <Link to="/volunteer-register" className="inline-flex items-center min-h-[44px] py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
                      {t('role_volunteers_cta')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/admin/login" className="inline-flex items-center min-h-[44px] py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors">
                      {t('auth_admin_login')}
                    </Link>
                  </li>
                  {supportEmail && (
                    <li>
                      <a
                        href={`mailto:${supportEmail}`}
                        className="inline-flex items-center gap-1.5 min-h-[44px] py-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t('footer_contact_support')}</span>
                      </a>
                    </li>
                  )}
                </ul>
              </nav>
            </div>
          </div>

          {/* Bottom Bar: Copyright, Honest Project Statement, Emergency Note, and Back to Top */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div className="space-y-1 text-center sm:text-left">
              <p className="font-medium text-slate-700 dark:text-slate-300">
                © {new Date().getFullYear()} FloodMonitor
              </p>
              <p className="max-w-xl leading-relaxed">
                {t('footer_project_note')}
              </p>
              <p className="text-red-600 dark:text-red-400 font-semibold">
                {t('footer_emergency_note')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label={t('footer_back_to_top')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 min-h-[44px] focus:ring-2 focus:ring-blue-500 transition-opacity ${
                showBackToTop ? 'opacity-100' : 'opacity-0 pointer-events-none sm:opacity-70 sm:pointer-events-auto'
              }`}
            >
              <ArrowUp className="w-4 h-4" aria-hidden="true" />
              <span>{t('footer_back_to_top')}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
