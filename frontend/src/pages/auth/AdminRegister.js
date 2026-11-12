import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Shield, Lock, Mail, User, Building, KeyRound, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { authAPI } from '../../services/api';
import AuthCard from '../../components/auth/AuthCard';
import { AuthField, PasswordField } from '../../components/auth/AuthField';
import PasswordStrength from '../../components/auth/PasswordStrength';
import SubmitButton from '../../components/common/SubmitButton';
import { applyFieldErrors, getErrorMessage } from '../../utils/apiError';
import { confirmPasswordRules, emailRules, lengthRules, passwordRules, required } from '../../utils/validation';
import toast, { toastError } from '../../utils/toast';

const FIELDS = ['name', 'email', 'department', 'password', 'confirm_password'];
const AMBER_BUTTON = 'w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm disabled:opacity-60 flex items-center justify-center gap-2';

export default function AdminRegister() {
  const { adminRegister } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null); // { token, role, email } once verified
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [registering, setRegistering] = useState(false);
  const { register, handleSubmit, watch, getValues, setError, formState: { errors } } = useForm();

  const verify = async (e) => {
    e.preventDefault();
    setVerifying(true);
    setTokenError('');
    try {
      const res = await authAPI.verifyToken({ token: token.trim() });
      setInvite({ token: token.trim(), role: res.data.role, email: res.data.email });
      toast.success(t('admin_invite_verified'));
    } catch (err) {
      setTokenError(getErrorMessage(err, t('admin_invite_invalid')));
    } finally {
      setVerifying(false);
    }
  };

  const onRegister = async (data) => {
    setRegistering(true);
    try {
      // The invite decides the role; no role is sent.
      const admin = await adminRegister({ ...data, registration_token: invite.token });
      toast.success(t('admin_created', { name: admin.name }));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      applyFieldErrors(err, setError, FIELDS);
      toastError(err, t('auth_register_failed'));
    } finally {
      setRegistering(false);
    }
  };

  return (
    <AuthCard icon={Shield} iconClass="bg-amber-500/15 text-amber-600 dark:text-amber-400"
      title={t('admin_register_title')} subtitle={t(invite ? 'admin_register_step2' : 'admin_register_step1')}>
      <ol className="flex items-center gap-2 mb-6" aria-label={t('admin_register_steps')}>
        {['admin_step_verify', 'admin_step_register'].map((key, i) => {
          const done = i === 0 && invite;
          const active = (i === 0 && !invite) || (i === 1 && invite);
          return (
            <li key={key} aria-current={active ? 'step' : undefined}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${active || done ? 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400' : 'text-slate-500 border-slate-200 dark:border-white/10'}`}>
              {done ? <CheckCircle className="w-3 h-3" aria-hidden="true" /> : <span aria-hidden="true">{i + 1}</span>} {t(key)}
            </li>
          );
        })}
      </ol>

      {!invite ? (
        <form onSubmit={verify} className="space-y-4" noValidate>
          <div>
            <label htmlFor="invite-code" className="auth-label">{t('admin_invite_code')}</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
              <input id="invite-code" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off"
                spellCheck={false} placeholder={t('admin_invite_placeholder')} aria-invalid={!!tokenError}
                className="auth-input pl-10 pr-3 font-mono" />
            </div>
            {tokenError && <p className="field-error" role="alert">{tokenError}</p>}
            <p className="auth-muted text-xs mt-2">{t('admin_invite_hint')}</p>
          </div>
          <SubmitButton loading={verifying} loadingText={t('admin_verifying')} disabled={!token.trim()} className={AMBER_BUTTON}>
            <KeyRound className="w-4 h-4" aria-hidden="true" /> {t('admin_verify_invite')}
          </SubmitButton>
        </form>
      ) : (
        <form onSubmit={handleSubmit(onRegister)} className="space-y-3" noValidate>
          <AuthField id="adm-name" label={t('field_full_name')} icon={User} required autoComplete="name"
            error={errors.name} {...register('name', { ...required(), ...lengthRules(2, 150) })} />
          <AuthField id="adm-email" type="email" label={t('field_email')} icon={Mail} required autoComplete="email"
            defaultValue={invite.email || ''} hint={invite.email ? t('admin_invite_email_locked') : undefined}
            readOnly={!!invite.email} error={errors.email} {...register('email', emailRules())} />
          <div className="grid grid-cols-2 gap-3">
            <AuthField id="adm-dept" label={t('field_department')} icon={Building}
              error={errors.department} {...register('department', lengthRules(0, 150))} />
            <div>
              <span className="auth-label">{t('field_role')}</span>
              <p className="auth-input px-3 bg-slate-100 dark:bg-white/5" title={t('admin_role_from_invite')}>{t(`role_${invite.role}`)}</p>
            </div>
          </div>
          <div>
            <PasswordField id="adm-password" label={t('field_password')} icon={Lock} required autoComplete="new-password"
              error={errors.password} {...register('password', passwordRules())} />
            <PasswordStrength password={watch('password', '')} />
          </div>
          <PasswordField id="adm-confirm" label={t('field_confirm_password')} icon={Lock} required autoComplete="new-password"
            error={errors.confirm_password} {...register('confirm_password', confirmPasswordRules(() => getValues('password')))} />
          <SubmitButton loading={registering} loadingText={t('auth_creating_account')} className={AMBER_BUTTON}>
            <Shield className="w-4 h-4" aria-hidden="true" /> {t('admin_create_account')}
          </SubmitButton>
        </form>
      )}

      <p className="text-center text-sm auth-muted mt-4">
        {t('admin_have_account')} <Link to="/admin/login" className="text-amber-600 dark:text-amber-400 font-medium">{t('auth_sign_in')}</Link>
      </p>
    </AuthCard>
  );
}
