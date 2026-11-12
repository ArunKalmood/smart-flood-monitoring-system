import React from 'react';
import { Eye } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import SettingsSubPage from './SettingsSubPage';

const PRIVACY_ITEMS = [
  { titleKey: 'settings_privacy_account_title', descKey: 'settings_privacy_account_desc' },
  { titleKey: 'settings_privacy_sos_title', descKey: 'settings_privacy_sos_desc' },
  { titleKey: 'settings_privacy_volunteer_title', descKey: 'settings_privacy_volunteer_desc' },
  { titleKey: 'settings_privacy_feedback_title', descKey: 'settings_privacy_feedback_desc' },
  { titleKey: 'settings_privacy_audit_title', descKey: 'settings_privacy_audit_desc' },
  { titleKey: 'settings_privacy_location_title', descKey: 'settings_privacy_location_desc' },
];

export default function PrivacySection() {
  const { t } = useLanguage();

  return (
    <SettingsSubPage
      title={t('settings_privacy_title')}
      description={t('settings_privacy_desc')}
      icon={Eye}
    >
      <section
        aria-labelledby="privacy-disclosures-heading"
        className="glass-card p-6 sm:p-7 border border-slate-200/80 dark:border-white/10 shadow-sm"
      >
        <h2 id="privacy-disclosures-heading" className="sr-only">
          {t('settings_privacy_title')}
        </h2>

        <div className="space-y-4">
          {PRIVACY_ITEMS.map((item) => (
            <div
              key={item.titleKey}
              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-white/5"
            >
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                {t(item.titleKey)}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t(item.descKey)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </SettingsSubPage>
  );
}
