import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Shield, Phone, BookOpen, Download, HelpCircle, Bell,
  CheckCircle, FileText, Heart, Info, Globe,
} from 'lucide-react';
import { publicAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import FaqList from '../../components/common/FaqList';
import EmptyState from '../../components/common/EmptyState';
import { EMERGENCY_NUMBERS } from '../../config/emergencyContacts';
import { FAQ_KEYS, RESOURCES, SAFETY_GUIDE_FILE, SAFETY_PHASES } from '../../constants/publicInfo';
import { SEVERITY_STYLES } from '../../constants/status';
import { formatDateTime, formatRelative } from '../../utils/datetime';

const IN_PAGE_NAV = [
  { id: 'conditions', labelKey: 'nav_conditions' },
  { id: 'emergency-contacts', labelKey: 'nav_contacts' },
  { id: 'safety', labelKey: 'nav_safety' },
  { id: 'faq', labelKey: 'nav_faqs' },
  { id: 'about', labelKey: 'nav_about' },
  { id: 'resources', labelKey: 'nav_resources' },
];

export default function PublicInfo() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [phase, setPhase] = useState(0);
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    publicAPI.summary()
      .then((res) => setAlerts(res.data?.alerts?.items || []))
      .catch(() => setAlerts([]));
  }, []);

  return (
    <div className="public-section min-h-[100dvh]">
      {/* Sticky In-Page Navigation Bar */}
      <nav
        aria-label="In-page navigation"
        className="sticky top-14 md:top-16 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800"
      >
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {IN_PAGE_NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="whitespace-nowrap flex-shrink-0 inline-flex items-center min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              {t(item.labelKey)}
            </a>
          ))}
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-12">
        {/* Page Heading */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold public-heading flex items-center gap-2.5">
            <BookOpen className="w-7 h-7 text-blue-500 flex-shrink-0" aria-hidden="true" />
            <span>{t('info_title')}</span>
          </h1>
          <p className="public-muted text-sm sm:text-base mt-1.5 max-w-2xl">
            {t('info_subtitle')}
          </p>
        </div>

        {/* Section 1: Active Alerts / Conditions */}
        <section id="conditions" className="scroll-mt-28" aria-labelledby="conditions-heading">
          <h2 id="conditions-heading" className="text-lg sm:text-xl font-bold public-heading mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" aria-hidden="true" />
            <span>{t('landing_alerts_title')}</span>
          </h2>

          {alerts === null ? (
            <div className="skeleton h-20 rounded-2xl" />
          ) : alerts.length === 0 ? (
            <div className="public-card p-6">
              <EmptyState icon={CheckCircle} title={t('landing_no_alerts')} compact />
            </div>
          ) : (
            <ul className="space-y-3">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className={`flex items-start gap-3 p-4 rounded-2xl border ${SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.medium}`}
                >
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-sm sm:text-base">{a.title}</p>
                    <p className="text-xs sm:text-sm opacity-85 mt-0.5">{a.message}</p>
                    <p className="text-xs opacity-70 mt-1" title={formatDateTime(a.created_at)}>
                      {a.affected_area && <>{a.affected_area} · </>}
                      {formatRelative(a.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Section 2: Emergency Contacts Directory */}
        <section id="emergency-contacts" className="scroll-mt-28" aria-labelledby="contacts-heading">
          <div className="mb-4">
            <h2 id="contacts-heading" className="text-lg sm:text-xl font-bold public-heading flex items-center gap-2">
              <Phone className="w-5 h-5 text-red-500" aria-hidden="true" />
              <span>{t('landing_contacts_title')}</span>
            </h2>
            <p className="public-muted text-xs sm:text-sm mt-1">
              {t('landing_contacts_subtitle')}
            </p>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {EMERGENCY_NUMBERS.map((c) => (
              <li key={c.number}>
                <a
                  href={`tel:${c.number}`}
                  className="public-card min-h-[56px] flex items-center justify-between p-4 hover:shadow-md active:bg-slate-50 dark:active:bg-white/5 transition-all focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <span className="block text-xs public-muted">{t(c.nameKey)}</span>
                      <span className="block public-heading font-bold text-base sm:text-lg">{c.number}</span>
                      <span className="block text-[11px] text-slate-400">{t(c.typeKey)}</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 px-2.5 py-1.5 rounded-lg">
                    Call
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* Section 3: Safety Guidelines */}
        <section id="safety" className="scroll-mt-28" aria-labelledby="safety-heading">
          <h2 id="safety-heading" className="text-lg sm:text-xl font-bold public-heading mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-500" aria-hidden="true" />
            <span>{t('info_safety_title')}</span>
          </h2>

          <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label={t('info_safety_title')}>
            {SAFETY_PHASES.map((p, i) => (
              <button
                key={p.titleKey}
                type="button"
                role="tab"
                id={`phase-tab-${i}`}
                aria-selected={phase === i}
                aria-controls="phase-panel"
                onClick={() => setPhase(i)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  phase === i
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'public-card public-muted hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t(p.titleKey)}
              </button>
            ))}
          </div>

          <div
            id="phase-panel"
            role="tabpanel"
            aria-labelledby={`phase-tab-${phase}`}
            className="public-card p-5 sm:p-6"
          >
            <ul className="space-y-3">
              {SAFETY_PHASES[phase].tips.map((key) => (
                <li key={key} className="flex items-start gap-3 text-sm sm:text-base public-muted leading-relaxed">
                  <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Section 4: Frequently Asked Questions */}
        <section id="faq" className="scroll-mt-28" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-lg sm:text-xl font-bold public-heading mb-4 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-purple-500" aria-hidden="true" />
            <span>{t('faq_title')}</span>
          </h2>
          <FaqList items={FAQ_KEYS.map(([q, a]) => ({ q: t(q), a: t(a) }))} />
        </section>

        {/* Section 5: About FloodMonitor */}
        <section id="about" className="scroll-mt-28" aria-labelledby="about-heading">
          <div className="public-card p-6 sm:p-8 space-y-5 border border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <Info className="w-5 h-5" aria-hidden="true" />
              </div>
              <h2 id="about-heading" className="text-lg sm:text-xl font-bold public-heading">
                {t('info_about_title')}
              </h2>
            </div>

            <p className="text-sm sm:text-base public-heading leading-relaxed">
              {t('info_about_what')}
            </p>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                {t('how_it_works_title')}
              </h3>
              <p className="text-sm public-muted leading-relaxed">
                {t('info_about_how')}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <Globe className="w-4 h-4 text-blue-500 flex-shrink-0" aria-hidden="true" />
              <span>{t('info_about_languages')}</span>
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-white/5">
              {t('footer_project_note')}
            </p>
          </div>
        </section>

        {/* Section 6: Downloads & Resources */}
        <section id="resources" className="scroll-mt-28" aria-labelledby="resources-heading">
          <div className="mb-4">
            <h2 id="resources-heading" className="text-lg sm:text-xl font-bold public-heading flex items-center gap-2">
              <Download className="w-5 h-5 text-emerald-500" aria-hidden="true" />
              <span>{t('info_resources')}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
            <a
              href={SAFETY_GUIDE_FILE}
              download
              className="public-card min-h-[56px] flex items-center justify-between p-4 hover:shadow-md transition-shadow focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <span className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-emerald-500 flex-shrink-0" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold public-heading">{t('footer_safety_guide')}</span>
                  <span className="block text-xs public-muted">{t('info_pdf_opens')}</span>
                </span>
              </span>
              <Download className="w-4 h-4 text-emerald-500" aria-hidden="true" />
            </a>

            {RESOURCES.map((r) => (
              <a
                key={r.file}
                href={r.file}
                target="_blank"
                rel="noopener noreferrer"
                className="public-card min-h-[56px] flex items-center justify-between p-4 hover:shadow-md transition-shadow focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <span className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-semibold public-heading">{t(r.titleKey)}</span>
                    <span className="block text-xs public-muted">{t('info_pdf_opens')}</span>
                  </span>
                </span>
                <Download className="w-4 h-4 text-blue-500" aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>

        {/* Quick Emergency Actions Bar */}
        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="font-bold text-base public-heading">{t('landing_final_cta_title')}</p>
            <p className="text-xs sm:text-sm public-muted mt-0.5">{t('landing_final_cta_desc')}</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Link
              to={isAuthenticated ? '/dashboard/sos' : '/login'}
              className="flex-1 sm:flex-none inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-md"
            >
              🆘 {t('info_submit_sos')}
            </Link>
            <Link
              to="/volunteer-register"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md"
            >
              <Heart className="w-4 h-4" aria-hidden="true" />
              <span>{t('landing_volunteer_cta')}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
