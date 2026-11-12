import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, Phone, ArrowRight, Radio, Bell, Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

/**
 * 3-step interactive Stepper (Sense -> Assess -> Respond)
 * Compact, keyboard-operable, ARIA tabs, no auto-rotation.
 */
function HowItWorksStepper({ t }) {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      id: 'sense',
      titleKey: 'stepper_sense',
      descKey: 'stepper_sense_desc',
      icon: Radio,
      badgeColor: 'text-blue-600 bg-blue-500/10 border-blue-500/20 dark:text-blue-400',
    },
    {
      id: 'assess',
      titleKey: 'stepper_assess',
      descKey: 'stepper_assess_desc',
      icon: Activity,
      badgeColor: 'text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-400',
    },
    {
      id: 'respond',
      titleKey: 'stepper_respond',
      descKey: 'stepper_respond_desc',
      icon: Bell,
      badgeColor: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400',
    },
  ];

  const handleKeyDown = (e, index) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % steps.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + steps.length) % steps.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = steps.length - 1;
    }
    if (nextIndex !== index) {
      setActiveStep(nextIndex);
      const tabEl = document.getElementById(`step-tab-${nextIndex}`);
      if (tabEl) tabEl.focus();
    }
  };

  const current = steps[activeStep];
  const CurrentIcon = current.icon;

  return (
    <section className="public-section-alt py-12 sm:py-16 border-t border-slate-200 dark:border-white/5" aria-labelledby="how-heading">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <h2 id="how-heading" className="text-xl sm:text-2xl font-bold public-heading mb-2">
            {t('how_it_works_title')}
          </h2>
          <p className="public-muted text-sm max-w-lg mx-auto">
            {t('how_it_works_subtitle')}
          </p>
        </div>

        {/* Stepper Tabs Bar */}
        <div
          role="tablist"
          aria-label={t('how_it_works_title')}
          className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 max-w-md mx-auto mb-6"
        >
          {steps.map((step, idx) => {
            const isSelected = activeStep === idx;
            return (
              <button
                key={step.id}
                role="tab"
                id={`step-tab-${idx}`}
                aria-selected={isSelected}
                aria-controls={`step-panel-${idx}`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setActiveStep(idx)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                className={`flex items-center justify-center gap-1.5 sm:gap-2 py-3 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[44px] ${
                  isSelected
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold bg-slate-100 dark:bg-slate-800">
                  {idx + 1}
                </span>
                <span>{t(step.titleKey)}</span>
              </button>
            );
          })}
        </div>

        {/* Active Step Panel */}
        <div
          role="tabpanel"
          id={`step-panel-${activeStep}`}
          aria-labelledby={`step-tab-${activeStep}`}
          tabIndex={0}
          className="public-card p-6 sm:p-8 max-w-xl mx-auto text-center border border-slate-200 dark:border-white/10 shadow-sm"
        >
          <div className={`w-12 h-12 rounded-2xl ${current.badgeColor} border flex items-center justify-center mx-auto mb-4`}>
            <CurrentIcon className="w-6 h-6" aria-hidden="true" />
          </div>
          <p className="inline-block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            Step {activeStep + 1}: {t(current.titleKey)}
          </p>
          <p className="public-heading text-base sm:text-lg font-medium leading-relaxed">
            {t(current.descKey)}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();

  return (
    <div className="pb-24 md:pb-0 overflow-x-hidden">
      {/* Centered Single-Column Hero (max-w ~720px) */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden pt-8 pb-12 sm:pt-14 sm:pb-18 md:pt-16 md:pb-20 text-center">
        <div className="max-w-2xl sm:max-w-3xl mx-auto px-4 sm:px-6 relative z-10 flex flex-col items-center w-full">
          {/* 1. Small badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-4 sm:mb-5">
            <span className="w-2 h-2 bg-blue-500 rounded-full" aria-hidden="true" />
            <span>{t('landing_badge')}</span>
          </div>

          {/* 2. H1 */}
          <h1 className="text-[clamp(2rem,5vw,3.75rem)] font-extrabold tracking-tight leading-[1.15] mb-4 public-heading max-w-2xl text-center">
            {t('landing_hero_headline')}
          </h1>

          {/* 3. Supporting sentence */}
          <p className="public-muted text-base sm:text-lg mb-7 sm:mb-8 leading-relaxed max-w-xl text-center">
            {t('landing_hero_supporting')}
          </p>

          {/* 4. Two buttons: side by side on desktop, stacked full width on mobile */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 w-full sm:w-auto mb-3">
            <Link
              to="/public-info"
              className="btn-primary min-h-[48px] px-7 py-3 text-base justify-center font-semibold shadow-sm"
            >
              <Activity className="w-5 h-5" aria-hidden="true" />
              <span>{t('landing_cta_status')}</span>
            </Link>

            <a
              href="tel:112"
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-7 py-3 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-base transition-colors shadow-sm"
            >
              <Phone className="w-5 h-5" aria-hidden="true" />
              <span>{t('sticky_call_112')}</span>
            </a>
          </div>

          {/* 5. Sign in / Create account text link */}
          <Link
            to="/login"
            className="inline-flex items-center justify-center min-h-[44px] px-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t('landing_cta_signin')}
          </Link>
        </div>

        {/* Decorative subtle gradient background wave along the bottom (aria-hidden, pure CSS/SVG, motion-safe) */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none opacity-40 dark:opacity-20 overflow-hidden"
        >
          <svg
            className="w-full h-full preserve-3d"
            viewBox="0 0 1200 120"
            preserveAspectRatio="none"
          >
            <path
              d="M0,0 C150,90 350,-40 500,40 C650,120 900,20 1200,60 L1200,120 L0,120 Z"
              className="fill-blue-500/20 dark:fill-blue-400/10"
            />
          </svg>
        </div>
      </section>

      {/* Quick actions: three tiles + slim reference link */}
      <section className="py-8 sm:py-12 max-w-7xl mx-auto px-4 sm:px-6" aria-label="Quick Actions">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {/* Tile 1: Check flood status */}
          <Link
            to="/public-info"
            className="public-card p-5 sm:p-6 flex items-start gap-4 hover:border-blue-500/50 hover:shadow-lg focus:ring-2 focus:ring-blue-500 focus:outline-none active:scale-[0.99] transition-all min-h-[80px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
              <Activity className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold public-heading mb-1">
                {t('landing_action_status_title')}
              </h2>
              <p className="text-xs sm:text-sm public-muted leading-relaxed">
                {t('landing_action_status_desc')}
              </p>
            </div>
          </Link>

          {/* Tile 2: Request help (SOS) */}
          <Link
            to={isAuthenticated ? '/dashboard/sos' : '/login'}
            className="public-card p-5 sm:p-6 flex items-start gap-4 hover:border-red-500/50 hover:shadow-lg focus:ring-2 focus:ring-red-500 focus:outline-none active:scale-[0.99] transition-all min-h-[80px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold public-heading mb-1">
                {t('landing_action_sos_title')}
              </h2>
              <p className="text-xs sm:text-sm public-muted leading-relaxed">
                {t(isAuthenticated ? 'landing_action_sos_desc' : 'landing_action_sos_desc_guest')}
              </p>
            </div>
          </Link>

          {/* Tile 3: Join as volunteer */}
          <Link
            to="/volunteer-register"
            className="public-card p-5 sm:p-6 flex items-start gap-4 hover:border-emerald-500/50 hover:shadow-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none active:scale-[0.99] transition-all min-h-[80px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
              <Users className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold public-heading mb-1">
                {t('landing_action_vol_title')}
              </h2>
              <p className="text-xs sm:text-sm public-muted leading-relaxed">
                {t('landing_action_vol_desc')}
              </p>
            </div>
          </Link>
        </div>

        {/* Slim text link under quick actions */}
        <div className="mt-6 text-center">
          <Link
            to="/public-info"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline min-h-[44px] px-3 py-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <span>{t('landing_ref_link')}</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* 5. How it works (compact, interactive stepper) */}
      <HowItWorksStepper t={t} />

      {/* Sticky Bottom Bar on Mobile ONLY */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg flex gap-2"
        role="region"
        aria-label="Mobile Emergency Actions"
      >
        <a
          href="tel:112"
          className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-red-600 active:bg-red-700 text-white font-bold text-sm shadow-md"
        >
          <Phone className="w-4 h-4" aria-hidden="true" />
          {t('sticky_call_112')}
        </a>
        {isAuthenticated ? (
          <Link
            to="/dashboard/sos"
            className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-amber-600 active:bg-amber-700 text-white font-bold text-sm shadow-md"
          >
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            {t('sticky_request_sos')}
          </Link>
        ) : (
          <Link
            to="/login"
            className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-blue-600 active:bg-blue-700 text-white font-bold text-sm shadow-md"
          >
            {t('auth_sign_in')}
          </Link>
        )}
      </div>
    </div>
  );
}
