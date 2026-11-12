import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLanguage } from '../../../context/LanguageContext';

export default function SettingsSubPage({
  title,
  description,
  icon: Icon,
  children,
  isDirty = false,
  onBack,
  maxWidth = 'max-w-3xl',
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const headingRef = useRef(null);
  const shouldReduceMotion = useReducedMotion();
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  // Set document title
  useEffect(() => {
    const prevTitle = document.title;
    document.title = `${title} · ${t('settings_title')} · FloodMonitor`;
    return () => {
      document.title = prevTitle;
    };
  }, [title, t]);

  // Scroll to top and move focus to h1 on mount/route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (headingRef.current) {
      headingRef.current.focus();
    }
  }, [title]);

  // Handle beforeunload when form is dirty
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleBack = (e) => {
    if (isDirty) {
      e.preventDefault();
      setShowUnsavedModal(true);
      return;
    }
    if (onBack) {
      e.preventDefault();
      onBack();
    }
  };

  const confirmLeave = () => {
    setShowUnsavedModal(false);
    navigate('/dashboard/settings');
  };

  return (
    <div className={`page-container ${maxWidth} pb-20`}>
      {/* Mobile Sticky Sub-header with Back link */}
      <div className="sticky top-14 z-20 -mx-4 px-4 py-2.5 mb-6 bg-slate-50/95 dark:bg-[#07111F]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between sm:hidden">
        <Link
          to="/dashboard/settings"
          onClick={handleBack}
          aria-label={t('settings_back')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-cyan-400 min-h-[44px] py-2 pr-3 -ml-2 rounded-lg hover:underline focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          <span>{t('settings_back')}</span>
        </Link>
      </div>

      {/* Desktop Top Back Link */}
      <div className="hidden sm:flex items-center mb-5">
        <Link
          to="/dashboard/settings"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-cyan-400 transition-colors min-h-[44px] py-2 pr-3 -ml-1 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          <span>{t('settings_back')}</span>
        </Link>
      </div>

      {/* Page Header */}
      <div className="mb-6">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2.5 outline-none"
        >
          {Icon && (
            <Icon className="w-6 h-6 text-blue-500 dark:text-cyan-400 flex-shrink-0" aria-hidden="true" />
          )}
          <span>{title}</span>
        </h1>
        {description && (
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {/* Main Content with subtle transition */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        {children}
      </motion.div>

      {/* Unsaved Changes Confirmation Modal */}
      {showUnsavedModal && (
        <div
          role="alertdialog"
          aria-labelledby="unsaved-modal-title"
          aria-describedby="unsaved-modal-desc"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 id="unsaved-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                  {t('settings_unsaved_confirm')}
                </h2>
                <p id="unsaved-modal-desc" className="text-xs text-slate-500 dark:text-slate-400">
                  {t('settings_unsaved_confirm')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-white/5">
              <button
                type="button"
                onClick={() => setShowUnsavedModal(false)}
                className="btn-outline min-h-[44px] px-4 text-xs font-semibold"
              >
                {t('settings_sign_out_cancel')}
              </button>
              <button
                type="button"
                onClick={confirmLeave}
                className="btn-primary min-h-[44px] px-4 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white"
              >
                {t('settings_unsaved_discard')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
