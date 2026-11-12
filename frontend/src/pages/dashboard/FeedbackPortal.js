import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { MessageSquare, Plus, Search, Eye, RefreshCw, Upload } from 'lucide-react';
import { feedbackAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import FormField from '../../components/common/FormField';
import SubmitButton from '../../components/common/SubmitButton';
import EmptyState from '../../components/common/EmptyState';
import { FEEDBACK_CATEGORIES, FEEDBACK_PRIORITIES, FEEDBACK_STATUSES, labelFor } from '../../constants/status';
import { applyFieldErrors } from '../../utils/apiError';
import { formatDate, formatDateTime } from '../../utils/datetime';
import { lengthRules, required } from '../../utils/validation';
import toast, { toastError } from '../../utils/toast';

const MAX_PHOTO_MB = 5;
const SEARCH_DEBOUNCE_MS = 400;
const PRIORITY_BADGE = { low: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400', medium: 'badge-info', high: 'badge-warning', critical: 'badge-danger' };
const STATUS_BADGE = { pending: 'badge-pending', under_review: 'badge-info', approved: 'badge-safe', rejected: 'badge-danger', resolved: 'badge-safe' };
const FORM_FIELDS = ['title', 'category', 'description', 'location', 'priority'];

function FeedbackForm({ onSubmitted }) {
  const { t } = useLanguage();
  const fileRef = useRef(null);
  const [photoError, setPhotoError] = useState('');
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { title: '', category: '', description: '', priority: 'medium', location: '', is_anonymous: false },
  });

  const onSubmit = async (data) => {
    const photo = fileRef.current?.files?.[0];
    if (photo && photo.size > MAX_PHOTO_MB * 1024 * 1024) {
      setPhotoError(t('val_photo_size', { mb: MAX_PHOTO_MB }));
      return;
    }
    setPhotoError('');
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => fd.append(k, typeof v === 'string' ? v.trim() : String(v)));
    if (photo) fd.append('photo', photo);
    try {
      await feedbackAPI.submit(fd);
      toast.success(t('fb_submitted'));
      onSubmitted();
    } catch (err) {
      applyFieldErrors(err, setError, FORM_FIELDS);
      toastError(err, t('fb_submit_failed'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <FormField label={t('field_title')} htmlFor="fb-title" required error={errors.title}>
        <input id="fb-title" className="input-base" placeholder={t('fb_title_placeholder')} {...register('title', { ...required(), ...lengthRules(3, 200) })} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('field_category')} htmlFor="fb-category" required error={errors.category}>
          <select id="fb-category" className="input-base" {...register('category', required())}>
            <option value="">{t('action_select')}</option>
            {FEEDBACK_CATEGORIES.map((c) => <option key={c} value={c}>{t(`fb_cat_${c}`)}</option>)}
          </select>
        </FormField>
        <FormField label={t('field_priority')} htmlFor="fb-priority" error={errors.priority}>
          <select id="fb-priority" className="input-base" {...register('priority')}>
            {FEEDBACK_PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority_${p}`)}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label={t('field_description')} htmlFor="fb-desc" required error={errors.description}>
        <textarea id="fb-desc" rows={4} className="input-base resize-none" placeholder={t('fb_description_placeholder')}
          {...register('description', { ...required(), ...lengthRules(5, 2000) })} />
      </FormField>
      <FormField label={t('field_location')} htmlFor="fb-location" error={errors.location}>
        <input id="fb-location" className="input-base" {...register('location', lengthRules(0, 300))} />
      </FormField>
      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
        <input type="checkbox" className="w-4 h-4 accent-blue-500" {...register('is_anonymous')} /> {t('fb_anonymous')}
      </label>
      <p className="text-xs text-slate-500">{t('fb_anonymous_hint')}</p>
      <FormField label={t('field_photo')} htmlFor="fb-photo" error={photoError ? { message: photoError } : null} hint={t('photo_hint', { mb: MAX_PHOTO_MB })}>
        <label className="flex items-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 cursor-pointer hover:border-blue-400 transition-colors">
          <Upload className="w-5 h-5 text-slate-400" aria-hidden="true" />
          <span className="text-xs text-slate-500">{t('photo_choose')}</span>
          <input id="fb-photo" ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" />
        </label>
      </FormField>
      <SubmitButton loading={isSubmitting} loadingText={t('action_submitting')}>{t('fb_submit')}</SubmitButton>
    </form>
  );
}

function FeedbackDetail({ item, canManage, onUpdated }) {
  const { t } = useLanguage();
  const [notes, setNotes] = useState(item.admin_notes || '');
  const [saving, setSaving] = useState(null);

  const update = async (status) => {
    setSaving(status);
    try {
      await feedbackAPI.update(item.id, { status, admin_notes: notes || undefined });
      toast.success(t('fb_updated'));
      onUpdated();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <dl className="space-y-3 mb-4 text-sm">
        <div><dt className="text-xs text-slate-500">{t('field_title')}</dt><dd className="font-medium text-slate-800 dark:text-white">{item.title}</dd></div>
        <div><dt className="text-xs text-slate-500">{t('field_description')}</dt><dd className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{item.description}</dd></div>
        <div className="grid grid-cols-3 gap-3">
          <div><dt className="text-xs text-slate-500">{t('field_category')}</dt><dd>{labelFor(t, 'fb_cat', item.category)}</dd></div>
          <div><dt className="text-xs text-slate-500">{t('field_priority')}</dt><dd>{labelFor(t, 'priority', item.priority)}</dd></div>
          <div><dt className="text-xs text-slate-500">{t('field_status')}</dt><dd>{labelFor(t, 'fb_status', item.status)}</dd></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><dt className="text-xs text-slate-500">{t('fb_submitted_by')}</dt><dd>{item.is_anonymous ? t('fb_anonymous_label') : item.submitted_by || '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">{t('field_date')}</dt><dd>{formatDateTime(item.created_at)}</dd></div>
        </div>
        {item.location && <div><dt className="text-xs text-slate-500">{t('field_location')}</dt><dd>{item.location}</dd></div>}
        {item.admin_notes && !canManage && <div><dt className="text-xs text-slate-500">{t('fb_admin_notes')}</dt><dd>{item.admin_notes}</dd></div>}
      </dl>
      {canManage && (
        <div className="space-y-2">
          <label htmlFor="fb-notes" className="field-label">{t('fb_admin_notes')}</label>
          <textarea id="fb-notes" rows={2} maxLength={2000} className="input-base resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex gap-2">
            {[
              { status: 'approved', cls: 'bg-green-600 hover:bg-green-500' },
              { status: 'rejected', cls: 'bg-red-600 hover:bg-red-500' },
              { status: 'resolved', cls: 'bg-blue-600 hover:bg-blue-500' },
            ].map((a) => (
              <button key={a.status} type="button" disabled={!!saving} onClick={() => update(a.status)}
                className={`flex-1 py-2 rounded-xl text-white text-xs font-medium disabled:opacity-60 ${a.cls}`}>
                {saving === a.status ? t('action_saving') : t(`fb_action_${a.status}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FeedbackPortal() {
  const { can } = useAuth();
  const { t } = useLanguage();
  const canManage = can('feedback.manage');
  const seesAll = can('feedback.view_all');
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchInput]);

  const load = useCallback(async () => {
    const params = { sort, limit: 100 };
    if (filterStatus !== 'all') params.status = filterStatus;
    if (filterPriority !== 'all') params.priority = filterPriority;
    if (search) params.search = search;
    const [list, s] = await Promise.allSettled([feedbackAPI.getAll(params), feedbackAPI.getStats()]);
    if (list.status === 'fulfilled') setItems(list.value.data?.items || []);
    else toastError(list.reason);
    if (s.status === 'fulfilled') setStats(s.value.data);
    setLoading(false);
  }, [filterStatus, filterPriority, sort, search]);

  useEffect(() => { load(); }, [load]);

  const columns = ['field_title', 'field_category', 'field_priority', ...(seesAll ? ['fb_submitted_by'] : []), 'field_status', 'field_date', 'field_actions'];

  return (
    <div className="page-container">
      <PageHeader icon={MessageSquare} iconClass="text-indigo-500" title={t(seesAll ? 'fb_title_staff' : 'fb_title_mine')}
        subtitle={t(seesAll ? 'fb_subtitle_staff' : 'fb_subtitle_mine')}>
        <button type="button" onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-4 h-4" aria-hidden="true" /> {t('fb_submit')}
        </button>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { labelKey: 'fb_stat_total', value: stats?.total, cls: 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white' },
          { labelKey: 'fb_stat_pending', value: stats?.pending, cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400' },
          { labelKey: 'fb_stat_resolved', value: stats?.resolved, cls: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' },
        ].map((s) => (
          <div key={s.labelKey} className={`rounded-2xl p-4 ${s.cls}`}>
            <p className="text-2xl font-bold">{s.value ?? '—'}</p>
            <p className="text-sm">{t(s.labelKey)}</p>
          </div>
        ))}
      </div>

      <div className="glass-card p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} maxLength={100}
            placeholder={t('fb_search_placeholder')} aria-label={t('fb_search_placeholder')} className="input-base pl-9" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label={t('field_status')} className="input-base w-auto text-xs">
          <option value="all">{t('filter_all_statuses')}</option>
          {FEEDBACK_STATUSES.map((s) => <option key={s} value={s}>{t(`fb_status_${s}`)}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} aria-label={t('field_priority')} className="input-base w-auto text-xs">
          <option value="all">{t('filter_all_priorities')}</option>
          {FEEDBACK_PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority_${p}`)}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('sort_label')} className="input-base w-auto text-xs">
          {['newest', 'oldest', 'priority'].map((s) => <option key={s} value={s}>{t(`sort_${s}`)}</option>)}
        </select>
        <button type="button" onClick={load} aria-label={t('action_refresh')} className="btn-outline py-2 px-3 text-xs">
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="table-container">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>{columns.map((h) => <th key={h} scope="col" className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{t(h)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={columns.length} className="p-4"><div className="skeleton h-8 rounded" /></td></tr>)
              ) : items.length === 0 ? (
                <tr><td colSpan={columns.length}><EmptyState icon={MessageSquare} title={t('fb_none')} compact /></td></tr>
              ) : items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 dark:text-slate-200 max-w-xs truncate">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">{item.description}</p>
                  </td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">{labelFor(t, 'fb_cat', item.category)}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[item.priority] || ''}`}>{labelFor(t, 'priority', item.priority)}</span></td>
                  {seesAll && (
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {item.is_anonymous ? <span className="italic">{t('fb_anonymous_label')}</span> : item.submitted_by || '—'}
                    </td>
                  )}
                  <td className="px-4 py-3"><span className={STATUS_BADGE[item.status] || 'badge-pending'}>{labelFor(t, 'fb_status', item.status)}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap" title={formatDateTime(item.created_at)}>{formatDate(item.created_at)}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setSelected(item)} aria-label={t('fb_view', { id: item.id })} title={t('action_view')}
                      className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600">
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={t('fb_submit')} icon={MessageSquare}>
        <FeedbackForm onSubmitted={() => { setShowForm(false); load(); }} />
      </Modal>
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? t('fb_detail_title', { id: selected.id }) : ''} icon={MessageSquare}>
        {selected && <FeedbackDetail item={selected} canManage={canManage} onUpdated={() => { setSelected(null); load(); }} />}
      </Modal>
    </div>
  );
}
