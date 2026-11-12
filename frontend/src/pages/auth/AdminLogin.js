import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Shield, Lock, Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import AuthCard from '../../components/auth/AuthCard';
import { AuthField, PasswordField } from '../../components/auth/AuthField';
import SubmitButton from '../../components/common/SubmitButton';
import { applyFieldErrors } from '../../utils/apiError';
import { emailRules, required } from '../../utils/validation';
import toast, { toastError } from '../../utils/toast';

export default function AdminLogin() {
  const { adminLogin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, setError, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const admin = await adminLogin(data);
      toast.success(t('auth_welcome', { name: admin.name }));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      applyFieldErrors(err, setError, ['email', 'password']);
      toastError(err, t('auth_login_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard icon={Shield} iconClass="bg-amber-500/15 text-amber-600 dark:text-amber-400"
      title={t('auth_admin_portal')} subtitle={t('auth_admin_portal_subtitle')}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <AuthField id="admin-email" type="email" autoComplete="email" label={t('field_email')} icon={Mail}
          placeholder="admin@example.gov.in" error={errors.email} {...register('email', emailRules())} />
        <PasswordField id="admin-password" autoComplete="current-password" label={t('field_password')} icon={Lock}
          placeholder="••••••••" error={errors.password} {...register('password', required())} />
        <SubmitButton loading={loading} loadingText={t('auth_signing_in')}
          className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm disabled:opacity-60 flex items-center justify-center gap-2">
          <Shield className="w-4 h-4" aria-hidden="true" /> {t('auth_admin_sign_in')}
        </SubmitButton>
      </form>
      <div className="border-t border-slate-200 dark:border-white/10 mt-6 pt-4 space-y-2 text-center">
        <Link to="/admin/register" className="block text-sm text-amber-600 hover:text-amber-500 dark:text-amber-400">{t('auth_admin_register_link')}</Link>
        <Link to="/login" className="block text-xs auth-muted">{t('auth_user_login_link')}</Link>
      </div>
    </AuthCard>
  );
}
