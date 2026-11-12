import React, { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  User,
  Shield,
  Bell,
  Palette,
  Eye,
  ScrollText,
  ChevronRight,
  KeyRound,
  Mail,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../context/LanguageContext';

export default function SettingsHome() {
  const { user, can } = useAuth();
  const { theme } = useTheme();
  const { language, languages, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const headingRef = useRef(null);

  const name = user?.full_name || user?.name || '';
  const isGoogle = user?.auth_provider === 'google';
  const canViewAudit = can('audit.view');

  // Handle in-page backward-compatible hash redirects (e.g. /dashboard/settings#security)
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    const HASH_MAP = {
      account: '/dashboard/settings/account',
      security: '/dashboard/settings/security',
      notifications: '/dashboard/settings/notifications',
      appearance: '/dashboard/settings/appearance',
      privacy: '/dashboard/settings/privacy',
      audit: '/dashboard/settings/audit',
    };
    if (hash && HASH_MAP[hash]) {
      // If audit is requested but user doesn't have permission, stay on home
      if (hash === 'audit' && !canViewAudit) return;
      navigate(HASH_MAP[hash], { replace: true });
    }
  }, [location.hash, navigate, canViewAudit]);

  // Set document title and focus on mount
  useEffect(() => {
    document.title = `${t('settings_title')} · FloodMonitor`;
    if (headingRef.current) {
      headingRef.current.focus();
    }
  }, [t]);

  // Summaries available without extra requests
  const securitySummary = isGoogle ? t('settings_auth_google') : t('settings_auth_password');
  const currentLangObj = languages.find((l) => l.code === language) || languages[0];
  const themeKey = theme === 'light' ? 'settings_light' : theme === 'dark' ? 'settings_dark' : 'settings_system';
  const themeSummary = t(themeKey);
  const appearanceSummary = `${themeSummary} · ${currentLangObj.nativeLabel}`;

  // Option groups
  const groups = [
    {
      id: 'account',
      title: t('settings_group_account'),
      items: [
        {
          to: '/dashboard/settings/account',
          title: t('settings_nav_account'),
          description: t('settings_account_desc'),
          icon: User,
          summary: null,
        },
        {
          to: '/dashboard/settings/security',
          title: t('settings_nav_security'),
          description: t('settings_security_desc'),
          icon: Shield,
          summary: securitySummary,
        },
      ],
    },
    {
      id: 'preferences',
      title: t('settings_group_preferences'),
      items: [
        {
          to: '/dashboard/settings/notifications',
          title: t('settings_nav_notifications'),
          description: t('settings_notif_desc'),
          icon: Bell,
          summary: null,
        },
        {
          to: '/dashboard/settings/appearance',
          title: t('settings_nav_appearance'),
          description: t('settings_appearance_desc'),
          icon: Palette,
          summary: appearanceSummary,
        },
      ],
    },
    {
      id: 'privacy',
      title: t('settings_group_privacy'),
      items: [
        {
          to: '/dashboard/settings/privacy',
          title: t('settings_nav_privacy'),
          description: t('settings_privacy_desc'),
          icon: Eye,
          summary: null,
        },
        ...(canViewAudit
          ? [
              {
                to: '/dashboard/settings/audit',
                title: t('settings_nav_audit'),
                description: t('settings_audit_desc'),
                icon: ScrollText,
                summary: null,
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <div className="page-container max-w-4xl pb-20">
      {/* Page Header */}
      <div className="mb-6">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2.5 outline-none"
        >
          <SettingsIcon className="w-6 h-6 text-blue-500 dark:text-cyan-400" aria-hidden="true" />
          <span>{t('settings_title')}</span>
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
          {t('settings_subtitle')}
        </p>
      </div>

      {/* Compact Account Summary Card at the Top */}
      <section
        aria-label={t('settings_nav_account')}
        className="glass-card p-5 sm:p-6 border border-slate-200/80 dark:border-white/10 shadow-sm mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {user?.profile_photo ? (
              <img
                src={user.profile_photo}
                alt={name}
                className="w-13 h-13 rounded-2xl object-cover border border-slate-200 dark:border-white/10 flex-shrink-0"
              />
            ) : (
              <div
                className="w-13 h-13 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                aria-hidden="true"
              >
                {(name || '?').charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white text-base truncate">
                  {name || '—'}
                </span>
                {user?.is_active !== false && (
                  <span className="badge-safe py-0 px-1.5 text-[10px] hidden sm:inline-flex items-center gap-0.5">
                    <CheckCircle className="w-3 h-3" aria-hidden="true" />
                    <span>{t('profile_active')}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                <Mail className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span>{user?.email || '—'}</span>
              </p>
              <div className="flex items-center gap-2 pt-1 text-xs">
                <span className="badge-info py-0 px-2 text-[11px]">
                  {user?.role ? t(`role_${user.role}`) : '—'}
                </span>
                <span className="text-slate-400 dark:text-slate-500">·</span>
                <span className="text-slate-600 dark:text-slate-400 inline-flex items-center gap-1 text-[11px]">
                  <KeyRound className="w-3 h-3 text-blue-500" aria-hidden="true" />
                  <span>{securitySummary}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center sm:self-center">
            <Link
              to="/dashboard/profile"
              className="btn-outline min-h-[44px] px-4 text-xs font-semibold inline-flex items-center gap-1.5 w-full sm:w-auto justify-center"
            >
              <User className="w-4 h-4" aria-hidden="true" />
              <span>{t('settings_edit_profile')}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Settings Navigation Groups */}
      <nav aria-label={t('settings_title')} className="space-y-8">
        {groups.map((group) => (
          <div key={group.id} className="space-y-3">
            <h2 className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 px-1">
              {group.title}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group glass-card p-4 sm:p-5 border border-slate-200/80 dark:border-white/10 rounded-2xl flex items-center justify-between gap-4 min-h-[56px] transition-all hover:border-blue-400 dark:hover:border-cyan-500/50 hover:shadow-md active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-cyan-500/10 text-blue-600 dark:text-cyan-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors truncate">
                          {item.title}
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.summary && (
                        <span className="hidden md:inline-block text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {item.summary}
                        </span>
                      )}
                      <ChevronRight
                        className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all"
                        aria-hidden="true"
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
