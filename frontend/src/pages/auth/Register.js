import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Mail, Lock, User, Phone, MapPin, Waves } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import AuthCard from '../../components/auth/AuthCard';
import { AuthField, PasswordField } from '../../components/auth/AuthField';
import GoogleSignInButton from '../../components/auth/GoogleSignInButton';
import PasswordStrength from '../../components/auth/PasswordStrength';
import SubmitButton from '../../components/common/SubmitButton';
import { applyFieldErrors } from '../../utils/apiError';
import {
  confirmPasswordRules, emailRules, lengthRules, passwordRules, phoneRules, pinCodeRules, required,
} from '../../utils/validation';
import toast, { toastError } from '../../utils/toast';

// Government authority access is granted by a super admin, never self-selected.
const ROLES = ['public_user', 'volunteer'];
const FIELDS = ['full_name', 'email', 'phone', 'role', 'address', 'city', 'state', 'pin_code', 'password', 'confirm_password'];

export default function Register() {
  const { register: createAccount, googleLogin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, watch, getValues, setError, formState: { errors } } = useForm({
    defaultValues: { role: 'public_user' },
  });

  const onGoogleCredential = async (credential) => {
    setLoading(true);
    try {
      const user = await googleLogin(credential);
      toast.success(t('auth_account_created', { name: user.full_name || user.name }));
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
      const user = await createAccount(data);
      toast.success(t('auth_account_created', { name: user.full_name }));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      applyFieldErrors(err, setError, FIELDS);
      toastError(err, t('auth_register_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard icon={Waves} title={t('auth_create_account')} subtitle={t('auth_join')} width="max-w-lg">
      <GoogleSignInButton onCredential={onGoogleCredential} disabled={loading} mode="register" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <AuthField id="reg-name" label={t('field_full_name')} icon={User} required autoComplete="name"
          error={errors.full_name} {...register('full_name', { ...required(), ...lengthRules(2, 150) })} />

        <div className="grid sm:grid-cols-2 gap-3">
          <AuthField id="reg-email" type="email" label={t('field_email')} icon={Mail} required autoComplete="email"
            placeholder="you@example.com" error={errors.email} {...register('email', emailRules())} />
          <AuthField id="reg-phone" type="tel" label={t('field_phone')} icon={Phone} required autoComplete="tel"
            placeholder="9876543210" error={errors.phone} {...register('phone', phoneRules())} />
        </div>

        <div>
          <label htmlFor="reg-role" className="auth-label">{t('field_account_type')}</label>
          <select id="reg-role" {...register('role')} className="auth-input px-3">
            {ROLES.map((r) => <option key={r} value={r}>{t(`role_${r}`)}</option>)}
          </select>
          <p className="auth-muted text-xs mt-1">{t('auth_gov_access_hint')}</p>
        </div>

        <AuthField id="reg-address" label={t('field_address')} icon={MapPin} autoComplete="street-address"
          error={errors.address} {...register('address', lengthRules(0, 300))} />

        <div className="grid grid-cols-3 gap-3">
          <AuthField id="reg-city" label={t('field_city')} autoComplete="address-level2" error={errors.city} {...register('city')} />
          <AuthField id="reg-state" label={t('field_state')} autoComplete="address-level1" error={errors.state} {...register('state')} />
          <AuthField id="reg-pin" label={t('field_pin_code')} inputMode="numeric" placeholder="000000"
            error={errors.pin_code} {...register('pin_code', pinCodeRules())} />
        </div>

        <div>
          <PasswordField id="reg-password" label={t('field_password')} icon={Lock} required autoComplete="new-password"
            error={errors.password} {...register('password', passwordRules())} />
          <PasswordStrength password={watch('password', '')} />
        </div>
        <PasswordField id="reg-confirm" label={t('field_confirm_password')} icon={Lock} required autoComplete="new-password"
          error={errors.confirm_password} {...register('confirm_password', confirmPasswordRules(() => getValues('password')))} />

        <SubmitButton loading={loading} loadingText={t('auth_creating_account')} className="btn-primary w-full">
          {t('auth_create_account')}
        </SubmitButton>
      </form>

      <p className="text-center text-sm auth-muted mt-4">
        {t('auth_have_account')} <Link to="/login" className="auth-link font-medium">{t('auth_sign_in')}</Link>
      </p>
    </AuthCard>
  );
}
