import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Mail, ArrowLeft, Send, CheckCircle, Info } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { authAPI } from '../../services/api';
import AuthCard from '../../components/auth/AuthCard';
import { AuthField } from '../../components/auth/AuthField';
import SubmitButton from '../../components/common/SubmitButton';
import { applyFieldErrors } from '../../utils/apiError';
import { emailRules } from '../../utils/validation';
import { toastError } from '../../utils/toast';

export default function ForgotPassword() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const { register, handleSubmit, setError, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await authAPI.forgotPassword(data);
      setSentTo(data.email);
    } catch (err) {
      applyFieldErrors(err, setError, ['email']);
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard icon={sentTo ? CheckCircle : Mail} title={t(sentTo ? 'forgot_sent_title' : 'forgot_title')}
      subtitle={sentTo ? t('forgot_sent', { email: sentTo }) : t('forgot_subtitle')}>
      {!sentTo && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <AuthField id="forgot-email" type="email" autoComplete="email" label={t('field_email')} icon={Mail}
            placeholder="you@example.com" error={errors.email} {...register('email', emailRules())} />
          <SubmitButton loading={loading} loadingText={t('action_sending')} className="btn-primary w-full">
            <Send className="w-4 h-4" aria-hidden="true" /> {t('forgot_submit')}
          </SubmitButton>
        </form>
      )}
      <p className="mt-4 flex items-start gap-2 text-xs auth-muted">
        <Info className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> {t('forgot_smtp_note')}
      </p>
      <div className="mt-6 text-center">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm auth-muted hover:text-slate-800 dark:hover:text-white">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {t('auth_back_to_login')}
        </Link>
      </div>
    </AuthCard>
  );
}
