import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Waves, Bell, Globe, ShieldCheck, Save, CheckCircle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import toast from 'react-hot-toast';

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { user, updateUser } = useAuth();
  const { language, setLanguage, t, LANGUAGE_META } = useLanguage();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setTimeout(() => {
      updateUser({ language });
      toast.success(t('settings_saved'));
      setSaving(false);
    }, 400);
  };

  return (
    <div className="page-container max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">{t('settings_title')}</h1>
        <p className="text-slate-500 text-sm mt-0.5">{t('settings_subtitle')}</p>
      </div>

      <div className="space-y-4">
        {/* Theme */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <Waves className="w-4 h-4 text-blue-500" /> {t('settings_appearance')}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{t('settings_theme_hint')}</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'light',  label: t('settings_light'),  icon: Sun,         preview: 'bg-white border-slate-200' },
              { value: 'dark',   label: t('settings_dark'),   icon: Moon,        preview: 'bg-slate-900 border-slate-700' },
              { value: 'system', label: t('settings_system'), icon: ShieldCheck, preview: 'bg-gradient-to-br from-white to-slate-900 border-slate-400' },
            ].map(thm => (
              <button
                key={thm.value}
                onClick={() => setTheme(thm.value)}
                className={`p-4 rounded-2xl border-2 transition-all ${theme === thm.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
              >
                <div className={`w-full h-12 rounded-xl ${thm.preview} mb-2 flex items-center justify-center border`}>
                  <thm.icon className="w-5 h-5 text-slate-500" />
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 text-center">{thm.label}</p>
                {theme === thm.value && <CheckCircle className="w-4 h-4 text-blue-500 mx-auto mt-1" />}
              </button>
            ))}
          </div>
        </div>

        {/* Language — real-time, includes Kannada */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
            <Globe className="w-4 h-4 text-green-500" /> {t('settings_language')}
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
            Changes apply instantly across the entire app
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {LANGUAGE_META.map(lang => (
              <motion.button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                whileTap={{ scale: 0.96 }}
                className={`py-3 px-3 rounded-xl text-sm font-medium border-2 transition-all flex flex-col items-center gap-0.5
                  ${language === lang.code
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
              >
                <span className="text-lg">{lang.flag}</span>
                <span className="font-semibold">{lang.nativeLabel}</span>
                <span className="text-xs opacity-60">{lang.label}</span>
                {language === lang.code && (
                  <CheckCircle className="w-3.5 h-3.5 text-blue-500 mt-0.5" />
                )}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500" /> {t('settings_notifications')}
          </h3>
          <div className="space-y-3">
            {[
              { key: 'settings_flood_warn',  defaultOn: true  },
              { key: 'settings_sos_updates', defaultOn: true  },
              { key: 'settings_weather',     defaultOn: true  },
              { key: 'settings_system_msg',  defaultOn: false },
            ].map((n, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                <span className="text-sm text-slate-700 dark:text-slate-300">{t(n.key)}</span>
                <input type="checkbox" defaultChecked={n.defaultOn} className="w-4 h-4 accent-blue-500" />
              </div>
            ))}
          </div>
        </div>

        {/* Security */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-500" /> {t('settings_security')}
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
              <span className="text-slate-700 dark:text-slate-300">{t('settings_2fa')}</span>
              <span className="badge-info">{t('coming_soon')}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
              <span className="text-slate-700 dark:text-slate-300">{t('settings_login_act')}</span>
              <span className="badge-safe">{t('normal')}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
              <span className="text-slate-700 dark:text-slate-300">{t('settings_session')}</span>
              <span className="text-slate-500 text-xs">60 {t('minutes')}</span>
            </div>
          </div>
        </div>

        <button onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? t('settings_saving') : <><Save className="w-4 h-4" /> {t('settings_save')}</>}
        </button>
      </div>
    </div>
  );
}
