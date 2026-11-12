import React from 'react';
import { useForm } from 'react-hook-form';
import { Heart } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { volunteerAPI } from '../../services/api';
import FormField from '../common/FormField';
import SubmitButton from '../common/SubmitButton';
import { BLOOD_GROUPS, VOLUNTEER_SKILLS } from '../../constants/status';
import { applyFieldErrors } from '../../utils/apiError';
import { emailRules, lengthRules, phoneRules, required } from '../../utils/validation';
import { toastError } from '../../utils/toast';

const FIELDS = ['full_name', 'email', 'phone', 'blood_group', 'skills', 'location', 'organization'];

/** Volunteer application form (public sign-up page and the staff "register volunteer" dialog). */
export default function VolunteerForm({ onSubmitted, submitLabel }) {
  const { t } = useLanguage();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { availability: true, skills: [] },
  });

  const onSubmit = async (data) => {
    try {
      const res = await volunteerAPI.register({ ...data, skills: data.skills || [] });
      onSubmitted(res.data);
    } catch (err) {
      applyFieldErrors(err, setError, FIELDS);
      toastError(err, t('vol_register_failed'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label={t('field_full_name')} htmlFor="vol-name" required error={errors.full_name}>
          <input id="vol-name" className="input-base" autoComplete="name" {...register('full_name', { ...required(), ...lengthRules(2, 150) })} />
        </FormField>
        <FormField label={t('field_email')} htmlFor="vol-email" required error={errors.email}>
          <input id="vol-email" type="email" className="input-base" autoComplete="email" {...register('email', emailRules())} />
        </FormField>
        <FormField label={t('field_phone')} htmlFor="vol-phone" required error={errors.phone}>
          <input id="vol-phone" type="tel" className="input-base" autoComplete="tel" placeholder="9876543210" {...register('phone', phoneRules())} />
        </FormField>
        <FormField label={t('field_blood_group')} htmlFor="vol-blood" error={errors.blood_group}>
          <select id="vol-blood" className="input-base" {...register('blood_group')}>
            <option value="">{t('action_select')}</option>
            {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
          </select>
        </FormField>
      </div>

      <fieldset>
        <legend className="field-label">{t('field_skills')}</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {VOLUNTEER_SKILLS.map((skill) => (
            <label key={skill} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 cursor-pointer text-xs text-slate-700 dark:text-slate-300 has-[:checked]:border-green-500 has-[:checked]:bg-green-500/10">
              <input type="checkbox" value={skill} className="w-4 h-4 accent-green-500" {...register('skills')} /> {t(`skill_${skill}`)}
            </label>
          ))}
        </div>
        {errors.skills && <p className="field-error" role="alert">{String(errors.skills.message)}</p>}
      </fieldset>

      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label={t('field_location')} htmlFor="vol-location" error={errors.location}>
          <input id="vol-location" className="input-base" placeholder={t('vol_location_placeholder')} {...register('location', lengthRules(0, 200))} />
        </FormField>
        <FormField label={t('field_organization')} htmlFor="vol-org" error={errors.organization}>
          <input id="vol-org" className="input-base" placeholder={t('vol_org_placeholder')} {...register('organization', lengthRules(0, 200))} />
        </FormField>
      </div>

      <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-600 cursor-pointer">
        <span>
          <span className="block text-sm font-medium text-slate-800 dark:text-white">{t('vol_available')}</span>
          <span className="block text-xs text-slate-500">{t('vol_available_hint')}</span>
        </span>
        <input type="checkbox" className="w-5 h-5 accent-green-500" {...register('availability')} />
      </label>

      <SubmitButton loading={isSubmitting} loadingText={t('action_submitting')}
        className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
        <Heart className="w-4 h-4" aria-hidden="true" /> {submitLabel}
      </SubmitButton>
    </form>
  );
}
