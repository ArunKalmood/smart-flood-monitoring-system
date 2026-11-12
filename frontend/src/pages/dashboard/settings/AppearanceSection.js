import React, { useCallback } from 'react';
import { Palette, Sun, Moon, Monitor, CheckCircle } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../context/LanguageContext';
import { userAPI } from '../../../services/api';
import toast, { toastError } from '../../../utils/toast';
import SettingsSubPage from './SettingsSubPage';

const THEMES = [
  { value: 'light', icon: Sun, preview: 'bg-white border-slate-200' },
  { value: 'dark', icon: Moon, preview: 'bg-slate-900 border-slate-700' },
  { value: 'system', icon: Monitor, preview: 'bg-gradient-to-br from-white to-slate-900 border-slate-400' },
];

export default function AppearanceSection() {
  const { updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t, languages } = useLanguage();

  const persistPreferences = useCallback(
    async (patch) => {
      try {
        const res = await userAPI.updateProfile(patch);
        if (res.data) {
          updateUser(res.data);
        }
        toast.success(t('settings_saved'), { id: 'pref-save-toast' });
      } catch (err) {
        toastError(err);
      }
    },
    [t, updateUser]
  );

  return (
    <SettingsSubPage
      title={t('settings_appearance_title')}
      description={t('settings_appearance_desc')}
      icon={Palette}
    >
      <section
        aria-labelledby="appearance-pref-heading"
        className="glass-card p-6 sm:p-7 border border-slate-200/80 dark:border-white/10 shadow-sm space-y-8"
      >
        <h2 id="appearance-pref-heading" className="sr-only">
          {t('settings_appearance_title')}
        </h2>

        {/* Theme Radiogroup */}
        <div>
          <span id="theme-selection-title" className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
            {t('settings_appearance')}
          </span>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('settings_theme_hint')}</p>
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            role="radiogroup"
            aria-labelledby="theme-selection-title"
          >
            {THEMES.map((thm) => {
              const isSelected = theme === thm.value;
              const Icon = thm.icon;
              return (
                <button
                  key={thm.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setTheme(thm.value);
                    persistPreferences({ theme: thm.value });
                  }}
                  className={`p-4 rounded-2xl border-2 transition-all text-left flex flex-col justify-between min-h-[96px] ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <span className={`w-8 h-8 rounded-xl ${thm.preview} flex items-center justify-center border shadow-xs`}>
                      <Icon className="w-4 h-4 text-slate-600 dark:text-slate-300" aria-hidden="true" />
                    </span>
                    {isSelected && <CheckCircle className="w-4 h-4 text-blue-500" aria-hidden="true" />}
                  </div>
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {t(`settings_${thm.value}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Language Radiogroup */}
        <div className="pt-6 border-t border-slate-200/60 dark:border-white/5">
          <span id="lang-selection-title" className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
            {t('settings_language')}
          </span>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('settings_language_hint')}</p>
          <div
            className="grid grid-cols-2 sm:grid-cols-3 gap-2.5"
            role="radiogroup"
            aria-labelledby="lang-selection-title"
          >
            {languages.map((lang) => {
              const isSelected = language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  lang={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    persistPreferences({ language: lang.code });
                  }}
                  className={`min-h-[52px] p-3 rounded-xl border-2 transition-all flex flex-col justify-center text-left ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/40'
                  }`}
                >
                  <span className="font-semibold text-sm leading-tight">{lang.nativeLabel}</span>
                  <span className="text-xs opacity-70 mt-0.5">{lang.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </SettingsSubPage>
  );
}
