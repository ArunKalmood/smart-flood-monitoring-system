import React, { useState } from 'react';
import { Shield, LogOut, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import ChangePasswordForm from '../../../components/account/ChangePasswordForm';
import SettingsSubPage from './SettingsSubPage';

export default function SecuritySection() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  return (
    <SettingsSubPage
      title={t('settings_security_title')}
      description={t('settings_security_desc')}
      icon={Shield}
    >
      <div className="space-y-8">
        {/* Password Change Form */}
        <section
          aria-labelledby="password-heading"
          className="glass-card p-6 sm:p-7 border border-slate-200/80 dark:border-white/10 shadow-sm"
        >
          <h2 id="password-heading" className="text-base font-bold text-slate-900 dark:text-white mb-4">
            {t('settings_security_title')}
          </h2>
          <ChangePasswordForm />
        </section>

        {/* Current Active Session Card */}
        <section
          aria-labelledby="session-heading"
          className="glass-card p-6 sm:p-7 border border-slate-200/80 dark:border-white/10 shadow-sm"
        >
          <h2 id="session-heading" className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
            {t('settings_session_title')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-5">
            {t('settings_session_signed_in', {
              email: user?.email,
              role: user?.role ? t(`role_${user.role}`) : '—',
            })}
          </p>

          {!showSignOutConfirm ? (
            <button
              type="button"
              onClick={() => setShowSignOutConfirm(true)}
              className="btn-outline min-h-[44px] px-4 text-xs font-semibold text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-950/20 inline-flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>{t('settings_session_sign_out')}</span>
            </button>
          ) : (
            <div
              role="alertdialog"
              aria-labelledby="signout-dialog-title"
              aria-describedby="signout-dialog-desc"
              className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/50 shadow-md space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <h3 id="signout-dialog-title" className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('settings_sign_out_confirm_title')}
                  </h3>
                  <p id="signout-dialog-desc" className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('settings_sign_out_confirm_desc')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowSignOutConfirm(false)}
                  className="btn-outline min-h-[44px] px-3.5 text-xs font-semibold"
                >
                  {t('settings_sign_out_cancel')}
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-sm inline-flex items-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  <span>{t('settings_sign_out_confirm_btn')}</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </SettingsSubPage>
  );
}
