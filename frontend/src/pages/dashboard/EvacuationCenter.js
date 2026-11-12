import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { Home, Plus, Edit2, Trash2, Utensils, Heart, Phone, MapPin, Search } from 'lucide-react';
import { evacuationAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import FormField from '../../components/common/FormField';
import SubmitButton from '../../components/common/SubmitButton';
import EmptyState from '../../components/common/EmptyState';
import { CENTER_STATUSES, labelFor } from '../../constants/status';
import { applyFieldErrors } from '../../utils/apiError';
import { bothOrNeither, latitudeRules, lengthRules, longitudeRules, phoneRules, required } from '../../utils/validation';
import { formatNumber } from '../../utils/units';
import toast, { toastError } from '../../utils/toast';

const STATUS_BADGE = { open: 'badge-safe', full: 'badge-warning', closed: 'badge-danger' };
const FIELDS = ['name', 'address', 'capacity', 'current_occupancy', 'latitude', 'longitude', 'contact_number', 'status'];
const EMPTY_CENTER = {
  name: '', address: '', capacity: '', current_occupancy: 0, latitude: '', longitude: '',
  contact_number: '', status: 'open', food_available: false, medical_available: false,
};

function CenterForm({ center, onSaved }) {
  const { t } = useLanguage();
  const { register, handleSubmit, getValues, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: center ? { ...EMPTY_CENTER, ...Object.fromEntries(Object.entries(center).map(([k, v]) => [k, v ?? ''])) } : EMPTY_CENTER,
  });

  const onSubmit = async (data) => {
    const payload = { ...data, capacity: Number(data.capacity || 0), current_occupancy: Number(data.current_occupancy || 0) };
    try {
      if (center) await evacuationAPI.update(center.id, payload);
      else await evacuationAPI.create(payload);
      toast.success(t(center ? 'evac_updated' : 'evac_created'));
      onSaved();
    } catch (err) {
      applyFieldErrors(err, setError, FIELDS);
      toastError(err);
    }
  };

  const numberRule = { validate: (v) => v === '' || Number(v) >= 0 || t('val_non_negative') };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <FormField label={t('evac_name')} htmlFor="evac-name" required error={errors.name}>
        <input id="evac-name" className="input-base" {...register('name', { ...required(), ...lengthRules(2, 200) })} />
      </FormField>
      <FormField label={t('field_address')} htmlFor="evac-address" error={errors.address}>
        <input id="evac-address" className="input-base" {...register('address', lengthRules(0, 300))} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('evac_capacity')} htmlFor="evac-capacity" required error={errors.capacity}>
          <input id="evac-capacity" type="number" min="0" className="input-base" {...register('capacity', { ...required(), ...numberRule })} />
        </FormField>
        <FormField label={t('evac_occupancy')} htmlFor="evac-occupancy" error={errors.current_occupancy}>
          <input id="evac-occupancy" type="number" min="0" className="input-base"
            {...register('current_occupancy', { validate: (v) => (Number(v || 0) >= 0 && Number(v || 0) <= Number(getValues('capacity') || 0)) || t('val_occupancy') })} />
        </FormField>
        <FormField label={t('field_latitude')} htmlFor="evac-lat" error={errors.latitude}>
          <input id="evac-lat" type="number" step="any" className="input-base"
            {...register('latitude', { validate: { range: latitudeRules().validate, pair: bothOrNeither(() => getValues('longitude')) } })} />
        </FormField>
        <FormField label={t('field_longitude')} htmlFor="evac-lng" error={errors.longitude}>
          <input id="evac-lng" type="number" step="any" className="input-base"
            {...register('longitude', { validate: { range: longitudeRules().validate, pair: bothOrNeither(() => getValues('latitude')) } })} />
        </FormField>
        <FormField label={t('evac_contact')} htmlFor="evac-contact" error={errors.contact_number}>
          <input id="evac-contact" type="tel" className="input-base" {...register('contact_number', phoneRules({ optional: true }))} />
        </FormField>
        <FormField label={t('field_status')} htmlFor="evac-status" error={errors.status}>
          <select id="evac-status" className="input-base" {...register('status')}>
            {CENTER_STATUSES.map((s) => <option key={s} value={s}>{t(`evac_status_${s}`)}</option>)}
          </select>
        </FormField>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
          <input type="checkbox" className="w-4 h-4 accent-green-500" {...register('food_available')} /> {t('evac_food')}
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
          <input type="checkbox" className="w-4 h-4 accent-red-500" {...register('medical_available')} /> {t('evac_medical')}
        </label>
      </div>
      <SubmitButton loading={isSubmitting} loadingText={t('action_saving')}>{t(center ? 'action_save' : 'action_create')}</SubmitButton>
    </form>
  );
}

export default function EvacuationCenter() {
  const { can } = useAuth();
  const { t } = useLanguage();
  const canManage = can('evacuation.manage');
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, center = edit
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await evacuationAPI.getAll();
      setCenters(res.data || []);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (center) => {
    if (!window.confirm(t('evac_confirm_delete', { name: center.name }))) return;
    try {
      await evacuationAPI.delete(center.id);
      toast.success(t('evac_deleted'));
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const needle = search.trim().toLowerCase();
  const filtered = centers.filter((c) => !needle || c.name?.toLowerCase().includes(needle) || c.address?.toLowerCase().includes(needle));
  const totalCapacity = centers.reduce((s, c) => s + (c.capacity || 0), 0);
  const totalOccupancy = centers.reduce((s, c) => s + (c.current_occupancy || 0), 0);

  return (
    <div className="page-container">
      <PageHeader icon={Home} iconClass="text-purple-500" title={t('evac_title')} subtitle={t('evac_subtitle')}>
        {canManage && (
          <button type="button" onClick={() => setEditing({})} className="btn-primary">
            <Plus className="w-4 h-4" aria-hidden="true" /> {t('evac_add')}
          </button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { labelKey: 'evac_stat_total', value: centers.length, cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
          { labelKey: 'evac_status_open', value: centers.filter((c) => c.status === 'open').length, cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
          { labelKey: 'evac_stat_capacity', value: formatNumber(totalCapacity, 0), cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
          { labelKey: 'evac_stat_occupied', value: `${formatNumber(totalOccupancy, 0)} (${totalCapacity ? Math.round((totalOccupancy / totalCapacity) * 100) : 0}%)`, cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
        ].map((s) => (
          <div key={s.labelKey} className={`rounded-2xl p-4 ${s.cls}`}>
            <p className="text-2xl font-bold">{loading ? '—' : s.value}</p>
            <p className="text-sm font-medium mt-1">{t(s.labelKey)}</p>
          </div>
        ))}
      </div>

      <div className="glass-card p-4 mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('evac_search')} aria-label={t('evac_search')} className="input-base pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-52 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card"><EmptyState icon={Home} title={t('evac_none')} /></div>
      ) : (
        <ul className="grid md:grid-cols-2 gap-4">
          {filtered.map((c, i) => {
            const pct = c.capacity > 0 ? Math.round((c.current_occupancy / c.capacity) * 100) : 0;
            return (
              <motion.li key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-5">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div>
                    <h2 className="font-bold text-slate-800 dark:text-white">{c.name}</h2>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" aria-hidden="true" />{c.address || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={STATUS_BADGE[c.status] || 'badge-info'}>{labelFor(t, 'evac_status', c.status)}</span>
                    {canManage && (
                      <>
                        <button type="button" onClick={() => setEditing(c)} aria-label={t('evac_edit', { name: c.name })}
                          className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400"><Edit2 className="w-3.5 h-3.5" aria-hidden="true" /></button>
                        <button type="button" onClick={() => remove(c)} aria-label={t('evac_delete', { name: c.name })}
                          className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{t('evac_occupied_count', { count: c.current_occupancy })}</span>
                    <span>{t('evac_capacity_pct', { capacity: c.capacity, pct })}</span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`h-full rounded-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <span className={`flex items-center gap-1.5 ${c.food_available ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
                    <Utensils className="w-3.5 h-3.5" aria-hidden="true" /> {t(c.food_available ? 'evac_food' : 'evac_no_food')}
                  </span>
                  <span className={`flex items-center gap-1.5 ${c.medical_available ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
                    <Heart className="w-3.5 h-3.5" aria-hidden="true" /> {t(c.medical_available ? 'evac_medical' : 'evac_no_medical')}
                  </span>
                  {c.contact_number ? (
                    <a href={`tel:${c.contact_number}`} className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline">
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" /> {c.contact_number}
                    </a>
                  ) : <span className="text-slate-400">—</span>}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} icon={Home}
        title={editing?.id ? t('evac_edit', { name: editing.name }) : t('evac_add')}>
        {editing !== null && <CenterForm center={editing.id ? editing : null} onSaved={() => { setEditing(null); load(); }} />}
      </Modal>
    </div>
  );
}
