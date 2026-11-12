import React, { useEffect, useMemo, useState } from 'react';
import { Save, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { userAPI } from '../../services/api';
import toast, { toastError } from '../../utils/toast';

const PREFS = [
  { key: 'flood_warnings', label: 'pref_flood_warnings', hint: 'pref_flood_warnings_hint' },
  { key: 'sos_updates', label: 'pref_sos_updates', hint: 'pref_sos_updates_hint' },
  { key: 'volunteer_updates', label: 'pref_volunteer_updates', hint: 'pref_volunteer_updates_hint' },
  { key: 'weather_alerts', label: 'pref_weather_alerts', hint: 'pref_weather_alerts_hint' },
  { key: 'system_messages', label: 'pref_system_messages', hint: 'pref_system_messages_hint' },
];

/**
 * Accessible notification-preferences editor with proper ARIA switches (role="switch", aria-checked).
 * Shared by Profile and Settings.
 */
export default function NotificationPreferences({ className = '' }) {
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
  const initialPrefs = useMemo(() => user?.notification_prefs || {}, [user?.notification_prefs]);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setPrefs(user?.notification_prefs || {});
    setSavedSuccess(false);
  }, [user?.notification_prefs]);

  const isDirty = useMemo(() => {
    return PREFS.some((p) => {
      const current = prefs[p.key] ?? true;
      const initial = initialPrefs[p.key] ?? true;
      return current !== initial;
    });
  }, [prefs, initialPrefs]);

  const togglePref = (key) => {
    setPrefs((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
    setSavedSuccess(false);
  };

  const save = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      const res = await userAPI.updateProfile({ notification_prefs: prefs });
      updateUser(res.data);
      toast.success(t('pref_saved'));
      setSavedSuccess(true);
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={className}>
      <div className="space-y-3" role="group" aria-label={t('settings_notifications')}>
        {PREFS.map((p) => {
          const isChecked = prefs[p.key] ?? true;
          return (
            <div
              key={p.key}
              className="flex items-center justify-between gap-4 p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-white/5 transition-colors"
            >
              <div className="flex-1 min-w-0 pr-2">
                <span
                  id={`notif-label-${p.key}`}
                  className="block text-sm font-semibold text-slate-800 dark:text-white"
                >
                  {t(p.label)}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {t(p.hint)}
                </span>
              </div>

              {/* Accessible 44px minimum switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isChecked}
                aria-labelledby={`notif-label-${p.key}`}
                onClick={() => togglePref(p.key)}
                className="relative inline-flex items-center justify-center p-2 min-h-[44px] min-w-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-xl"
              >
                <span
                  className={`inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    isChecked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                  aria-hidden="true"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      isChecked ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 pt-3 border-t border-slate-200/60 dark:border-white/5">
        <div aria-live="polite" className="text-xs">
          {savedSuccess && !isDirty && (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('pref_saved')}</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={save}
          disabled={!isDirty || saving}
          className="btn-primary min-h-[44px] px-6 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          <span>{saving ? t('action_saving') : t('pref_save')}</span>
        </button>
      </div>
    </div>
  );
}
