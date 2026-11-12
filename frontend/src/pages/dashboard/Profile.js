import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { User, Phone, MapPin, Save, CheckCircle, Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { userAPI } from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import FormField from '../../components/common/FormField';
import SubmitButton from '../../components/common/SubmitButton';
import NotificationPreferences from '../../components/common/NotificationPreferences';
import ChangePasswordForm from '../../components/account/ChangePasswordForm';
import { applyFieldErrors } from '../../utils/apiError';
import { formatDate } from '../../utils/datetime';
import { lengthRules, phoneRules, pinCodeRules, required } from '../../utils/validation';
import toast, { toastError } from '../../utils/toast';

const TABS = ['profile', 'security', 'notifications'];

function ProfileForm() {
  const { user, updateUser, isAdmin } = useAuth();
  const { t } = useLanguage();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      full_name: user?.full_name || '', phone: user?.phone || '', address: user?.address || '',
      city: user?.city || '', state: user?.state || '', pin_code: user?.pin_code || '', department: user?.department || '',
    },
  });

  const onSave = async (data) => {
    const payload = isAdmin
      ? { full_name: data.full_name, department: data.department }
      : { full_name: data.full_name, phone: data.phone, address: data.address, city: data.city, state: data.state, pin_code: data.pin_code };
    try {
      const res = await userAPI.updateProfile(payload);
      updateUser(res.data);
      toast.success(t('profile_saved'));
    } catch (err) {
      applyFieldErrors(err, setError, Object.keys(payload));
      toastError(err);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-4" noValidate>
      <div className="grid sm:grid-cols-2 gap-4">
        <FormField label={t('field_full_name')} htmlFor="pf-name" required error={errors.full_name}>
          <input id="pf-name" className="input-base" autoComplete="name" {...register('full_name', { ...required(), ...lengthRules(2, 150) })} />
        </FormField>
        {isAdmin ? (
          <FormField label={t('field_department')} htmlFor="pf-dept" error={errors.department}>
            <input id="pf-dept" className="input-base" {...register('department', lengthRules(0, 150))} />
          </FormField>
        ) : (
          <FormField label={t('field_phone')} htmlFor="pf-phone" required={user?.auth_provider !== 'google'} error={errors.phone}>
            <input id="pf-phone" type="tel" className="input-base" autoComplete="tel" {...register('phone', phoneRules({ optional: user?.auth_provider === 'google' }))} />
          </FormField>
        )}
      </div>
      <FormField label={t('field_email')} htmlFor="pf-email" hint={t('profile_email_locked')}>
        <input id="pf-email" value={user?.email || ''} className="input-base opacity-70" readOnly />
      </FormField>
      {!isAdmin && (
        <>
          <FormField label={t('field_address')} htmlFor="pf-address" error={errors.address}>
            <input id="pf-address" className="input-base" autoComplete="street-address" {...register('address', lengthRules(0, 300))} />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label={t('field_city')} htmlFor="pf-city" error={errors.city}>
              <input id="pf-city" className="input-base" {...register('city', lengthRules(0, 100))} />
            </FormField>
            <FormField label={t('field_state')} htmlFor="pf-state" error={errors.state}>
              <input id="pf-state" className="input-base" {...register('state', lengthRules(0, 100))} />
            </FormField>
            <FormField label={t('field_pin_code')} htmlFor="pf-pin" error={errors.pin_code}>
              <input id="pf-pin" inputMode="numeric" className="input-base" {...register('pin_code', pinCodeRules())} />
            </FormField>
          </div>
        </>
      )}
      <SubmitButton loading={isSubmitting} loadingText={t('action_saving')}>
        <Save className="w-4 h-4" aria-hidden="true" /> {t('action_save_changes')}
      </SubmitButton>
    </form>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [tab, setTab] = useState('profile');
  const name = user?.full_name || user?.name || '';

  return (
    <div className="page-container max-w-3xl">
      <PageHeader icon={User} title={t('profile_title')} subtitle={t('profile_subtitle')} />

      <div className="glass-card p-6 mb-6 flex items-center gap-4">
        {user?.profile_photo ? (
          <img
            src={user.profile_photo}
            alt={name}
            className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 border border-slate-200 dark:border-white/10"
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0" aria-hidden="true">
            {(name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">{name}</h2>
          <p className="text-slate-500 text-sm flex items-center gap-1"><Mail className="w-3 h-3" aria-hidden="true" /> {user?.email}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="badge-info">{user?.role ? t(`role_${user.role}`) : '—'}</span>
            {user?.is_active !== false && <span className="badge-safe flex items-center gap-1"><CheckCircle className="w-3 h-3" aria-hidden="true" /> {t('profile_active')}</span>}
            {user?.created_at && <span className="text-xs text-slate-500">{t('profile_member_since', { date: formatDate(user.created_at) })}</span>}
          </div>
          {user?.phone && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Phone className="w-3 h-3" aria-hidden="true" /> {user.phone}</p>}
          {user?.city && <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden="true" /> {user.city}</p>}
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-6" role="tablist" aria-label={t('profile_title')}>
        {TABS.map((key) => (
          <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={tab === key} aria-controls={`panel-${key}`} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${tab === key ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            {t(`profile_tab_${key}`)}
          </button>
        ))}
      </div>

      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="glass-card p-6">
        <h2 className="font-semibold text-slate-800 dark:text-white mb-4">{t(`profile_tab_${tab}_title`)}</h2>
        {tab === 'profile' && <ProfileForm />}
        {tab === 'security' && <ChangePasswordForm />}
        {tab === 'notifications' && <NotificationPreferences />}
      </section>
    </div>
  );
}
