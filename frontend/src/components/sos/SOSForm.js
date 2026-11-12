import React, { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { AlertTriangle, Camera, Navigation } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { sosAPI } from '../../services/api';
import FormField from '../common/FormField';
import SubmitButton from '../common/SubmitButton';
import { EMERGENCY_TYPES } from '../../constants/status';
import { applyFieldErrors } from '../../utils/apiError';
import { bothOrNeither, latitudeRules, lengthRules, longitudeRules, phoneRules, required } from '../../utils/validation';
import toast, { toastError } from '../../utils/toast';

const MAX_PHOTO_MB = 5;
const FIELDS = ['name', 'phone', 'emergency_type', 'description', 'location', 'latitude', 'longitude'];

/** SOS request form. Name and phone are pre-filled from the signed-in account. */
export default function SOSForm({ onSubmitted }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const fileRef = useRef(null);
  const [locating, setLocating] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const { register, handleSubmit, setValue, getValues, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { name: user?.full_name || user?.name || '', phone: user?.phone || '', emergency_type: '' },
  });

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast.error(t('geo_unsupported'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue('latitude', pos.coords.latitude.toFixed(6), { shouldValidate: true });
        setValue('longitude', pos.coords.longitude.toFixed(6), { shouldValidate: true });
        setLocating(false);
        toast.success(t('geo_captured'));
      },
      (err) => {
        setLocating(false);
        toast.error(t(err.code === err.PERMISSION_DENIED ? 'geo_denied_manual' : 'geo_failed_manual'));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onSubmit = async (data) => {
    const photo = fileRef.current?.files?.[0];
    if (photo && photo.size > MAX_PHOTO_MB * 1024 * 1024) {
      setPhotoError(t('val_photo_size', { mb: MAX_PHOTO_MB }));
      return;
    }
    setPhotoError('');
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== '') fd.append(k, String(v).trim()); });
    if (photo) fd.append('photo', photo);
    try {
      await sosAPI.submit(fd);
      toast.success(t('sos_submitted'));
      onSubmitted();
    } catch (err) {
      applyFieldErrors(err, setError, FIELDS);
      toastError(err, t('sos_submit_failed'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label={t('field_full_name')} htmlFor="sos-name" required error={errors.name}>
          <input id="sos-name" className="input-base" autoComplete="name" {...register('name', { ...required(), ...lengthRules(2, 150) })} />
        </FormField>
        <FormField label={t('field_phone')} htmlFor="sos-phone" required error={errors.phone}>
          <input id="sos-phone" type="tel" className="input-base" autoComplete="tel" placeholder="9876543210" {...register('phone', phoneRules())} />
        </FormField>
      </div>

      <FormField label={t('sos_emergency_type')} htmlFor="sos-type" required error={errors.emergency_type}>
        <select id="sos-type" className="input-base" {...register('emergency_type', required())}>
          <option value="">{t('action_select')}</option>
          {EMERGENCY_TYPES.map((type) => <option key={type} value={type}>{t(`emergency_${type}`)}</option>)}
        </select>
      </FormField>

      <FormField label={t('field_location')} htmlFor="sos-location" error={errors.location}>
        <input id="sos-location" className="input-base" placeholder={t('sos_location_placeholder')} {...register('location', lengthRules(0, 300))} />
      </FormField>

      <div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('field_latitude')} htmlFor="sos-lat" error={errors.latitude}>
            <input id="sos-lat" type="number" step="any" inputMode="decimal" className="input-base" placeholder="19.0760"
              {...register('latitude', { validate: { range: latitudeRules().validate, pair: bothOrNeither(() => getValues('longitude')) } })} />
          </FormField>
          <FormField label={t('field_longitude')} htmlFor="sos-lng" error={errors.longitude}>
            <input id="sos-lng" type="number" step="any" inputMode="decimal" className="input-base" placeholder="72.8777"
              {...register('longitude', { validate: { range: longitudeRules().validate, pair: bothOrNeither(() => getValues('latitude')) } })} />
          </FormField>
        </div>
        <button type="button" onClick={captureLocation} disabled={locating} className="mt-2 btn-ghost text-xs px-2 py-1">
          <Navigation className={`w-4 h-4 ${locating ? 'animate-pulse' : ''}`} aria-hidden="true" />
          {locating ? t('geo_locating') : t('geo_use_my_location')}
        </button>
      </div>

      <FormField label={t('field_description')} htmlFor="sos-desc" error={errors.description} hint={t('val_max_length', { n: 1000 })}>
        <textarea id="sos-desc" rows={3} className="input-base resize-none" placeholder={t('sos_description_placeholder')}
          {...register('description', lengthRules(0, 1000))} />
      </FormField>

      <FormField label={t('field_photo')} htmlFor="sos-photo" error={photoError ? { message: photoError } : null}
        hint={t('photo_hint', { mb: MAX_PHOTO_MB })}>
        <label className="flex items-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 cursor-pointer hover:border-blue-400 transition-colors">
          <Camera className="w-5 h-5 text-slate-400" aria-hidden="true" />
          <span className="text-xs text-slate-500">{t('photo_choose')}</span>
          <input id="sos-photo" ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" />
        </label>
      </FormField>

      <SubmitButton loading={isSubmitting} loadingText={t('action_submitting')} className="w-full btn-danger">
        <AlertTriangle className="w-4 h-4" aria-hidden="true" /> {t('sos_send')}
      </SubmitButton>
    </form>
  );
}
