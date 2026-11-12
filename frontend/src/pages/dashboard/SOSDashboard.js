import React, { useCallback, useState } from 'react';
import { AlertTriangle, CheckCircle, MapPin, Plus, RefreshCw } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { sosAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import usePolling from '../../hooks/usePolling';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import SOSForm from '../../components/sos/SOSForm';
import SOSCard from '../../components/sos/SOSCard';
import {
  FitToPoints, INDIA_CENTER, InvalidateSizeOnMount, TILE_ATTRIBUTION, TILE_URL, dotIcon, withValidCoords,
} from '../../components/maps/mapUtils';
import { SOS_ACTIVE_STATUSES, SOS_STATUS_STYLES } from '../../constants/status';
import { formatDateTime } from '../../utils/datetime';
import toast, { toastError } from '../../utils/toast';

const POLL_MS = 30000;
const FILTERS = ['all', 'active', 'pending', 'accepted', 'in_progress', 'rescued', 'resolved', 'cancelled'];

export default function SOSDashboard() {
  const { can } = useAuth();
  const { t } = useLanguage();
  const seesAll = can('sos.view_all');
  const [sosList, setSosList] = useState([]);
  const [mapData, setMapData] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const [list, map, s] = await Promise.allSettled([sosAPI.getAll({ limit: 200 }), sosAPI.getMapData(), sosAPI.getStats()]);
    if (list.status === 'fulfilled') setSosList(list.value.data?.items || []);
    if (map.status === 'fulfilled') setMapData(withValidCoords(map.value.data, 'SOS requests'));
    if (s.status === 'fulfilled') setStats(s.value.data);
    if (list.status === 'rejected') toastError(list.reason);
    setLoading(false);
  }, []);

  usePolling(load, POLL_MS);

  const changeStatus = async (sos, status) => {
    if (status === 'cancelled' && !window.confirm(t('sos_confirm_cancel', { id: sos.id }))) return;
    setBusyId(sos.id);
    try {
      await sosAPI.updateStatus(sos.id, { status });
      toast.success(t('sos_status_updated', { id: sos.id, status: t(`sos_status_${status}`) }));
      await load();
    } catch (err) {
      toastError(err);
    } finally {
      setBusyId(null);
    }
  };

  const filtered = sosList.filter((s) =>
    filter === 'all' || (filter === 'active' ? SOS_ACTIVE_STATUSES.includes(s.status) : s.status === filter));
  const points = mapData.map((s) => [s.latitude, s.longitude]);

  const subtitle = seesAll ? t('sos_subtitle_staff') : can('sos.view_assigned') ? t('sos_subtitle_volunteer') : t('sos_subtitle_public');

  return (
    <div className="page-container">
      <PageHeader icon={AlertTriangle} iconClass="text-red-500" title={t(seesAll ? 'sos_title_staff' : 'sos_title_mine')} subtitle={subtitle}>
        <button type="button" onClick={() => setShowForm(true)} className="btn-danger">
          <Plus className="w-4 h-4" aria-hidden="true" /> {t('sos_submit')}
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { labelKey: 'sos_stat_total', value: stats?.total, cls: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' },
          { labelKey: 'sos_stat_active', value: stats?.active, cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400' },
          { labelKey: 'sos_stat_in_progress', value: stats ? stats.accepted + stats.in_progress : undefined, cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
          { labelKey: 'sos_stat_rescued', value: stats ? stats.rescued + stats.resolved : undefined, cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
        ].map((s) => (
          <div key={s.labelKey} className={`rounded-2xl p-4 ${s.cls} flex items-center gap-3`}>
            <span className="text-3xl font-black">{s.value ?? '—'}</span>
            <span className="text-sm font-medium">{t(s.labelKey)}</span>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 glass-card overflow-hidden flex flex-col" style={{ height: 460 }} aria-labelledby="sos-map-title">
          <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 id="sos-map-title" className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-500" aria-hidden="true" /> {t('sos_map_title')}
            </h2>
            <span className="text-xs text-slate-500">{t('sos_map_count', { count: mapData.length })}</span>
          </div>
          <div className="flex-1 relative">
            <MapContainer center={INDIA_CENTER} zoom={5} className="h-full w-full z-0">
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              <InvalidateSizeOnMount />
              <FitToPoints points={points} />
              {mapData.map((sos) => (
                <Marker key={sos.id} position={[sos.latitude, sos.longitude]} icon={dotIcon(SOS_STATUS_STYLES[sos.status]?.pin || '#ef4444')}>
                  <Popup>
                    <strong>{t(`emergency_${sos.emergency_type}`)} · #{sos.id}</strong>
                    <br />{sos.name} · {sos.phone}
                    {sos.location && <><br />{sos.location}</>}
                    <br />{t(`sos_status_${sos.status}`)} · {formatDateTime(sos.created_at)}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
            {!loading && mapData.length === 0 && (
              <p className="absolute bottom-3 left-3 right-3 z-[400] text-center text-xs bg-white/90 dark:bg-slate-800/90 rounded-lg p-2 text-slate-600 dark:text-slate-300">
                {t('sos_map_empty')}
              </p>
            )}
          </div>
        </section>

        <section className="lg:col-span-2 glass-card overflow-hidden" aria-label={t('sos_list_label')}>
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <label htmlFor="sos-filter" className="sr-only">{t('sos_filter')}</label>
            <select id="sos-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="input-base py-1.5 text-xs w-auto">
              {FILTERS.map((f) => <option key={f} value={f}>{f === 'all' ? t('filter_all') : f === 'active' ? t('sos_filter_active') : t(`sos_status_${f}`)}</option>)}
            </select>
            <button type="button" onClick={load} aria-label={t('action_refresh')}
              className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
            {loading ? (
              <div className="p-4 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={CheckCircle} title={t('sos_none')} message={seesAll ? undefined : t('sos_none_hint')} />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filtered.map((sos) => <SOSCard key={sos.id} sos={sos} onChangeStatus={changeStatus} busy={busyId === sos.id} />)}
              </ul>
            )}
          </div>
        </section>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={t('sos_form_title')} icon={AlertTriangle}>
        <SOSForm onSubmitted={() => { setShowForm(false); load(); }} />
      </Modal>
    </div>
  );
}
