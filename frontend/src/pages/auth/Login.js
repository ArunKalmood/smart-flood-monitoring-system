import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Mail, Lock, Waves, LogIn, PhoneCall } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import AuthCard from '../../components/auth/AuthCard';
import { AuthField, PasswordField } from '../../components/auth/AuthField';
import GoogleSignInButton from '../../components/auth/GoogleSignInButton';
import SubmitButton from '../../components/common/SubmitButton';
import { applyFieldErrors } from '../../utils/apiError';
import { emailRules, required } from '../../utils/validation';
import toast, { toastError } from '../../utils/toast';

export default function Login() {
  const { login, googleLogin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, setError, formState: { errors } } = useForm({ defaultValues: { remember_me: false } });

  const onGoogleCredential = async (credential) => {
    setLoading(true);
    try {
      const user = await googleLogin(credential);
      toast.success(t('auth_welcome_back', { name: user.full_name || user.name }));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toastError(err, t('auth_google_login_failed'));
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const user = await login(data);
      toast.success(t('auth_welcome_back', { name: user.full_name || user.name }));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      applyFieldErrors(err, setError, ['email', 'password']);
      toastError(err, t('auth_login_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard icon={Waves} title={t('auth_welcome_title')} subtitle={t('auth_sign_in_subtitle')}>
      <a href="tel:112" className="mb-5 flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">
        <PhoneCall className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> {t('auth_emergency_banner')}
      </a>

      <GoogleSignInButton onCredential={onGoogleCredential} disabled={loading} mode="login" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <AuthField id="login-email" type="email" autoComplete="email" label={t('field_email')} icon={Mail}
          placeholder="you@example.com" error={errors.email} {...register('email', emailRules())} />
        <PasswordField id="login-password" autoComplete="current-password" label={t('field_password')} icon={Lock}
          placeholder="••••••••" error={errors.password} {...register('password', required())} />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" {...register('remember_me')} className="w-4 h-4 rounded accent-blue-500" />
            {t('auth_remember_me')}
          </label>
          <Link to="/forgot-password" className="text-sm auth-link">{t('auth_forgot_link')}</Link>
        </div>

        <SubmitButton loading={loading} loadingText={t('auth_signing_in')} className="btn-primary w-full mt-2">
          <LogIn className="w-4 h-4" aria-hidden="true" /> {t('auth_sign_in')}
        </SubmitButton>
      </form>

      <p className="text-center text-sm auth-muted mt-6">
        {t('auth_no_account')} <Link to="/register" className="auth-link font-medium">{t('auth_sign_up')}</Link>
      </p>
      <div className="border-t border-slate-200 dark:border-white/10 mt-4 pt-4 text-center">
        <Link to="/admin/login" className="text-xs auth-muted hover:text-slate-700 dark:hover:text-slate-300">{t('auth_admin_login_link')}</Link>
      </div>
    </AuthCard>
  );
}
