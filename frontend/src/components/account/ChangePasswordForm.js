import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { authAPI } from '../../services/api';
import FormField from '../common/FormField';
import SubmitButton from '../common/SubmitButton';
import PasswordStrength from '../auth/PasswordStrength';
import { applyFieldErrors } from '../../utils/apiError';
import { confirmPasswordRules, passwordRules, required } from '../../utils/validation';
import toast, { toastError } from '../../utils/toast';

/**
 * Shared ChangePasswordForm used by Settings (primary) and Profile.
 * Supports:
 * - Local accounts: current, new, confirm password with show/hide toggles
 * - Google accounts: official managed-by-Google notice
 * - Exact backend validation rules (8+ chars, upper, lower, number, special)
 * - Password strength meter with zero external dependencies
 * - Accessible error messages with aria-describedby
 * - Complete reset on success
 */
export default function ChangePasswordForm({ className = '' }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
  });

  // Google accounts cannot have/change local passwords
  if (user?.auth_provider === 'google') {
    return (
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 text-sm text-slate-600 dark:text-slate-300">
        <p className="leading-relaxed">{t('profile_google_managed_password')}</p>
      </div>
    );
  }

  const onSubmit = async (data) => {
    try {
      await authAPI.changePassword({
        current_password: data.current_password,
        new_password: data.new_password,
      });
      toast.success(t('profile_password_changed'));
      reset();
    } catch (err) {
      if (!applyFieldErrors(err, setError, ['new_password'])) {
        setError('current_password', { message: t('profile_password_wrong') });
      }
      toastError(err);
    }
  };

  const newPasswordValue = watch('new_password', '');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={`space-y-4 ${className}`} noValidate>
      {/* Current Password */}
      <FormField
        label={t('profile_current_password')}
        htmlFor="settings-current-password"
        required
        error={errors.current_password}
      >
        <div className="relative">
          <input
            id="settings-current-password"
            type={showCurrent ? 'text' : 'password'}
            autoComplete="current-password"
            aria-describedby={errors.current_password ? 'settings-current-password-error' : undefined}
            className="input-base pr-12"
            {...register('current_password', required())}
          />
          <button
            type="button"
            onClick={() => setShowCurrent(!showCurrent)}
            aria-label={t(showCurrent ? 'action_hide_password' : 'action_show_password')}
            aria-pressed={showCurrent}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            {showCurrent ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
          </button>
        </div>
      </FormField>

      {/* New Password */}
      <FormField
        label={t('profile_new_password')}
        htmlFor="settings-new-password"
        required
        error={errors.new_password}
      >
        <div className="relative">
          <input
            id="settings-new-password"
            type={showNew ? 'text' : 'password'}
            autoComplete="new-password"
            aria-describedby={errors.new_password ? 'settings-new-password-error' : undefined}
            className="input-base pr-12"
            {...register('new_password', passwordRules())}
          />
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            aria-label={t(showNew ? 'action_hide_password' : 'action_show_password')}
            aria-pressed={showNew}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            {showNew ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
          </button>
        </div>
        <PasswordStrength password={newPasswordValue} />
      </FormField>

      {/* Confirm New Password */}
      <FormField
        label={t('field_confirm_password')}
        htmlFor="settings-confirm-password"
        required
        error={errors.confirm_password}
      >
        <div className="relative">
          <input
            id="settings-confirm-password"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            aria-describedby={errors.confirm_password ? 'settings-confirm-password-error' : undefined}
            className="input-base pr-12"
            {...register('confirm_password', confirmPasswordRules(() => getValues('new_password')))}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            aria-label={t(showConfirm ? 'action_hide_password' : 'action_show_password')}
            aria-pressed={showConfirm}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            {showConfirm ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
          </button>
        </div>
      </FormField>

      <div className="pt-2">
        <SubmitButton
          loading={isSubmitting}
          disabled={!isDirty || isSubmitting}
          loadingText={t('action_saving')}
        >
          <Lock className="w-4 h-4" aria-hidden="true" />
          <span>{t('profile_update_password')}</span>
        </SubmitButton>
      </div>
    </form>
  );
}
