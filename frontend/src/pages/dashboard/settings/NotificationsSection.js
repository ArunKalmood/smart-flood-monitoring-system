import React from 'react';
import { Bell } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import NotificationPreferences from '../../../components/common/NotificationPreferences';
import SettingsSubPage from './SettingsSubPage';

export default function NotificationsSection() {
  const { t } = useLanguage();

  return (
    <SettingsSubPage
      title={t('settings_notif_title')}
      description={t('settings_notif_desc')}
      icon={Bell}
    >
      <section
        aria-labelledby="notif-pref-heading"
        className="glass-card p-6 sm:p-7 border border-slate-200/80 dark:border-white/10 shadow-sm"
      >
        <h2 id="notif-pref-heading" className="sr-only">
          {t('settings_notif_title')}
        </h2>
        <NotificationPreferences />
      </section>
    </SettingsSubPage>
  );
}
