import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Package, Truck, Heart, Box, Users, Shield, Flame, Plus, Edit2, Trash2, MapPin, RefreshCw } from 'lucide-react';
import { resourceAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import FormField from '../../components/common/FormField';
import SubmitButton from '../../components/common/SubmitButton';
import EmptyState from '../../components/common/EmptyState';
import { RESOURCE_TYPES, labelFor } from '../../constants/status';
import { applyFieldErrors } from '../../utils/apiError';
import { lengthRules, required } from '../../utils/validation';
import toast, { toastError } from '../../utils/toast';

const TYPE_STYLE = {
  boat: { icon: Truck, cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  ambulance: { icon: Heart, cls: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800' },
  food_kit: { icon: Box, cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  medical_kit: { icon: Heart, cls: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800' },
  volunteer: { icon: Users, cls: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
  police: { icon: Shield, cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  fire_department: { icon: Flame, cls: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800' },
};
const FIELDS = ['name', 'type', 'quantity_total', 'quantity_available', 'current_location', 'assigned_team'];
const EMPTY = { name: '', type: 'boat', quantity_total: 0, quantity_available: 0, current_location: '', assigned_team: '', is_available: true };

function ResourceForm({ resource, onSaved }) {
  const { t } = useLanguage();
  const { register, handleSubmit, getValues, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: resource ? { ...EMPTY, ...Object.fromEntries(Object.entries(resource).map(([k, v]) => [k, v ?? ''])) } : EMPTY,
  });

  const onSubmit = async (data) => {
    const payload = { ...data, quantity_total: Number(data.quantity_total || 0), quantity_available: Number(data.quantity_available || 0) };
    try {
      if (resource) await resourceAPI.update(resource.id, payload);
      else await resourceAPI.create(payload);
      toast.success(t(resource ? 'res_updated' : 'res_created'));
      onSaved();
    } catch (err) {
      applyFieldErrors(err, setError, FIELDS);
      toastError(err);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <FormField label={t('res_name')} htmlFor="res-name" required error={errors.name}>
        <input id="res-name" className="input-base" {...register('name', { ...required(), ...lengthRules(2, 200) })} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('res_type')} htmlFor="res-type" required error={errors.type}>
          <select id="res-type" className="input-base" {...register('type', required())}>
            {RESOURCE_TYPES.map((type) => <option key={type} value={type}>{t(`res_type_${type}`)}</option>)}
          </select>
        </FormField>
        <FormField label={t('res_total')} htmlFor="res-total" error={errors.quantity_total}>
          <input id="res-total" type="number" min="0" className="input-base"
            {...register('quantity_total', { validate: (v) => Number(v || 0) >= 0 || t('val_non_negative') })} />
        </FormField>
        <FormField label={t('res_available')} htmlFor="res-available" error={errors.quantity_available}>
          <input id="res-available" type="number" min="0" className="input-base"
            {...register('quantity_available', { validate: (v) => (Number(v || 0) >= 0 && Number(v || 0) <= Number(getValues('quantity_total') || 0)) || t('val_available_qty') })} />
        </FormField>
        <FormField label={t('field_location')} htmlFor="res-location" error={errors.current_location}>
          <input id="res-location" className="input-base" {...register('current_location', lengthRules(0, 300))} />
        </FormField>
      </div>
      <FormField label={t('res_team')} htmlFor="res-team" error={errors.assigned_team}>
        <input id="res-team" className="input-base" {...register('assigned_team', lengthRules(0, 200))} />
      </FormField>
      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
        <input type="checkbox" className="w-4 h-4 accent-green-500" {...register('is_available')} /> {t('res_is_available')}
      </label>
      <SubmitButton loading={isSubmitting} loadingText={t('action_saving')}>{t(resource ? 'action_save' : 'action_create')}</SubmitButton>
    </form>
  );
}

export default function ResourceTracker() {
  const { can } = useAuth();
  const { t } = useLanguage();
  const canManage = can('resources.manage');
  const [resources, setResources] = useState([]);
  const [activeType, setActiveType] = useState('all');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await resourceAPI.getAll();
      setResources(res.data || []);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (resource) => {
    if (!window.confirm(t('res_confirm_delete', { name: resource.name }))) return;
    try {
      await resourceAPI.delete(resource.id);
      toast.success(t('res_deleted'));
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const filtered = activeType === 'all' ? resources : resources.filter((r) => r.type === activeType);
  const summary = RESOURCE_TYPES.map((type) => {
    const rows = resources.filter((r) => r.type === type);
    return { type, total: rows.reduce((s, r) => s + (r.quantity_total || 0), 0), available: rows.reduce((s, r) => s + (r.quantity_available || 0), 0) };
  });
  const columns = ['res_name', 'res_type', 'res_available', 'field_location', 'res_team', 'field_status', ...(canManage ? ['field_actions'] : [])];

  return (
    <div className="page-container">
      <PageHeader icon={Package} title={t('res_title')} subtitle={t('res_subtitle')}>
        {canManage && (
          <button type="button" onClick={() => setEditing({})} className="btn-primary">
            <Plus className="w-4 h-4" aria-hidden="true" /> {t('res_add')}
          </button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {summary.map(({ type, total, available }) => {
          const { icon: Icon, cls } = TYPE_STYLE[type];
          return (
            <button key={type} type="button" aria-pressed={activeType === type} onClick={() => setActiveType(activeType === type ? 'all' : type)}
              className={`glass-card p-3 text-center border-2 transition-all ${activeType === type ? 'border-blue-500 dark:border-blue-400' : 'border-transparent'}`}>
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2 border ${cls}`}><Icon className="w-4 h-4" aria-hidden="true" /></span>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">{t(`res_type_${type}`)}</span>
              <span className="block text-lg font-bold text-slate-800 dark:text-white">{available}</span>
              <span className="block text-xs text-slate-500">{t('res_of_total', { total })}</span>
            </button>
          );
        })}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {activeType === 'all' ? t('res_all') : t(`res_type_${activeType}`)} ({filtered.length})
          </h2>
          <button type="button" onClick={load} aria-label={t('action_refresh')} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="table-container">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>{columns.map((h) => <th key={h} scope="col" className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{t(h)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => <tr key={i}><td colSpan={columns.length} className="p-4"><div className="skeleton h-8 rounded" /></td></tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length}><EmptyState icon={Package} title={t('res_none')} compact /></td></tr>
              ) : filtered.map((r) => {
                const style = TYPE_STYLE[r.type];
                const pct = r.quantity_total > 0 ? Math.round((r.quantity_available / r.quantity_total) * 100) : 0;
                return (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.name}</td>
                    <td className="px-4 py-3">
                      {style ? (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${style.cls}`}>
                          <style.icon className="w-3 h-3" aria-hidden="true" /> {t(`res_type_${r.type}`)}
                        </span>
                      ) : labelFor(t, 'res_type', r.type)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{r.quantity_available}/{r.quantity_total}</span>
                        <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden" aria-hidden="true">
                          <div className={`h-full rounded-full ${pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden="true" />{r.current_location || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{r.assigned_team || '—'}</td>
                    <td className="px-4 py-3"><span className={r.is_available ? 'badge-safe' : 'badge-danger'}>{t(r.is_available ? 'res_status_available' : 'res_status_deployed')}</span></td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setEditing(r)} aria-label={t('res_edit', { name: r.name })}
                            className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400"><Edit2 className="w-3.5 h-3.5" aria-hidden="true" /></button>
                          <button type="button" onClick={() => remove(r)} aria-label={t('res_delete', { name: r.name })}
                            className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} icon={Package} size="max-w-md"
        title={editing?.id ? t('res_edit', { name: editing.name }) : t('res_add')}>
        {editing !== null && <ResourceForm resource={editing.id ? editing : null} onSaved={() => { setEditing(null); load(); }} />}
      </Modal>
    </div>
  );
}
