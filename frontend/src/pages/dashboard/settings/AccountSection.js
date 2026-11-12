import React from 'react';
import { Link } from 'react-router-dom';
import { User, Mail, CheckCircle, KeyRound, Clock } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { formatDateTime } from '../../../utils/datetime';
import SettingsSubPage from './SettingsSubPage';

export default function AccountSection() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const name = user?.full_name || user?.name || '';
  const isGoogle = user?.auth_provider === 'google';

  return (
    <SettingsSubPage
      title={t('settings_account_title')}
      description={t('settings_account_desc')}
      icon={User}
    >
      <section
        aria-labelledby="account-details-heading"
        className="glass-card p-6 sm:p-7 border border-slate-200/80 dark:border-white/10 shadow-sm"
      >
        <h2 id="account-details-heading" className="sr-only">
          {t('settings_account_title')}
        </h2>

        {/* User Identity Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mb-6">
          {user?.profile_photo ? (
            <img
              src={user.profile_photo}
              alt={name}
              className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-white/10 flex-shrink-0"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
              aria-hidden="true"
            >
              {(name || '?').charAt(0).toUpperCase()}
            </div>
          )}

          <div className="space-y-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
              {name || '—'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
              <Mail className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>{user?.email || '—'}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="badge-info">
                {user?.role ? t(`role_${user.role}`) : '—'}
              </span>
              {user?.is_active !== false && (
                <span className="badge-safe flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('profile_active')}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Credentials & Sign-in Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-t border-slate-200/60 dark:border-white/5 text-sm">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-white/5">
            <span className="block text-xs text-slate-500 dark:text-slate-400 font-medium">
              {t('settings_auth_method')}
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 mt-1">
              <KeyRound className="w-4 h-4 text-blue-500" aria-hidden="true" />
              <span>{isGoogle ? t('settings_auth_google') : t('settings_auth_password')}</span>
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-white/5">
            <span className="block text-xs text-slate-500 dark:text-slate-400 font-medium">
              {t('settings_last_login')}
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 mt-1">
              <Clock className="w-4 h-4 text-indigo-500" aria-hidden="true" />
              <span>{user?.last_login ? formatDateTime(user.last_login) : t('settings_last_login_never')}</span>
            </span>
          </div>
        </div>

        {/* Link to Full Profile */}
        <div className="pt-4 border-t border-slate-200/60 dark:border-white/5 flex justify-end">
          <Link
            to="/dashboard/profile"
            className="btn-outline min-h-[44px] px-5 text-sm font-semibold inline-flex items-center gap-2"
          >
            <User className="w-4 h-4" aria-hidden="true" />
            <span>{t('settings_edit_profile')}</span>
          </Link>
        </div>
      </section>
    </SettingsSubPage>
  );
}
