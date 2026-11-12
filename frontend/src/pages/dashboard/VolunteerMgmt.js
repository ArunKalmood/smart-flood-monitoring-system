import React, { useCallback, useEffect, useState } from 'react';
import { Users, Plus, Search, RefreshCw, Phone, MapPin, Droplets } from 'lucide-react';
import { volunteerAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import VolunteerForm from '../../components/volunteers/VolunteerForm';
import { VOLUNTEER_ACTIONS, VOLUNTEER_STATUS_BADGE, labelFor } from '../../constants/status';
import { formatDate } from '../../utils/datetime';
import toast, { toastError } from '../../utils/toast';

const STATUS_FILTERS = ['all', 'pending', 'approved', 'suspended', 'rejected'];
const ACTION_STYLES = {
  approved: 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300',
  suspended: 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
};

export default function VolunteerMgmt() {
  const { can } = useAuth();
  const { t } = useLanguage();
  const canManage = can('volunteers.approve');
  const [volunteers, setVolunteers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const [v, s] = await Promise.allSettled([volunteerAPI.getAll({ limit: 200 }), volunteerAPI.getStats()]);
    if (v.status === 'fulfilled') setVolunteers(v.value.data?.items || []);
    else toastError(v.reason);
    if (s.status === 'fulfilled') setStats(s.value.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (volunteer, status) => {
    if (status === 'suspended' && !window.confirm(t('vol_confirm_suspend', { name: volunteer.full_name }))) return;
    setBusyId(volunteer.id);
    try {
      await volunteerAPI.updateStatus(volunteer.id, status);
      toast.success(t('vol_status_updated', { name: volunteer.full_name, status: t(`vol_status_${status}`) }));
      await load();
    } catch (err) {
      toastError(err);
    } finally {
      setBusyId(null);
    }
  };

  const needle = search.trim().toLowerCase();
  const filtered = volunteers
    .filter((v) => filterStatus === 'all' || v.status === filterStatus)
    .filter((v) => !needle || v.full_name?.toLowerCase().includes(needle) || v.email?.toLowerCase().includes(needle));
  const columns = ['vol_col_volunteer', 'vol_col_contact', 'field_blood_group', 'field_skills', 'field_location', 'field_status', ...(canManage ? ['field_actions'] : [])];

  return (
    <div className="page-container">
      <PageHeader icon={Users} iconClass="text-purple-500" title={t('vol_title')} subtitle={t('vol_subtitle')}>
        {canManage && (
          <button type="button" onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus className="w-4 h-4" aria-hidden="true" /> {t('vol_register')}
          </button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { labelKey: 'vol_stat_total', value: stats?.total, cls: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' },
          { labelKey: 'vol_status_approved', value: stats?.approved, cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
          { labelKey: 'vol_status_pending', value: stats?.pending, cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
          { labelKey: 'vol_stat_available', value: stats?.available, cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('vol_search')} aria-label={t('vol_search')} className="input-base pl-9" />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('field_status')}>
          {STATUS_FILTERS.map((s) => (
            <button key={s} type="button" aria-pressed={filterStatus === s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
              {s === 'all' ? t('filter_all') : t(`vol_status_${s}`)}
            </button>
          ))}
        </div>
        <button type="button" onClick={load} className="btn-outline py-2 px-3 text-xs">
          <RefreshCw className="w-3 h-3" aria-hidden="true" /> {t('action_refresh')}
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
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length}><EmptyState icon={Users} title={t('vol_none')} compact /></td></tr>
              ) : filtered.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{v.full_name}</p>
                    <p className="text-xs text-slate-500">{v.email}</p>
                    <p className="text-xs text-slate-400">{t('vol_applied', { date: formatDate(v.created_at) })}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" aria-hidden="true" />{v.phone}</span>
                  </td>
                  <td className="px-4 py-3">
                    {v.blood_group ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">
                        <Droplets className="w-3 h-3" aria-hidden="true" /> {v.blood_group}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(v.skills) ? v.skills : []).map((sk) => (
                        <span key={sk} className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">{labelFor(t, 'skill', sk)}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {v.location ? <span className="flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden="true" />{v.location}</span> : '—'}
                  </td>
                  <td className="px-4 py-3"><span className={VOLUNTEER_STATUS_BADGE[v.status] || 'badge-pending'}>{labelFor(t, 'vol_status', v.status)}</span></td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(VOLUNTEER_ACTIONS[v.status] || []).map((status) => (
                          <button key={status} type="button" disabled={busyId === v.id} onClick={() => changeStatus(v, status)}
                            className={`text-xs px-2 py-1 rounded-lg disabled:opacity-50 ${ACTION_STYLES[status]}`}>
                            {t(v.status === 'suspended' && status === 'approved' ? 'vol_action_reinstate' : `vol_action_${status}`)}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('vol_register')} icon={Users}>
        <VolunteerForm submitLabel={t('vol_register')}
          onSubmitted={() => { toast.success(t('vol_registered')); setShowAdd(false); load(); }} />
      </Modal>
    </div>
  );
}
