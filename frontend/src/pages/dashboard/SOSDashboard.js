import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, Phone, MapPin, Clock, CheckCircle,
  User, Plus, X, Filter, RefreshCw, Camera, Navigation
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import { sosAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const STATUS_COLORS = {
  pending:  { badge: 'badge-pending', dot: 'bg-yellow-500' },
  accepted: { badge: 'badge-info',    dot: 'bg-blue-500' },
  rescued:  { badge: 'badge-safe',    dot: 'bg-green-500' },
  closed:   { badge: 'badge-safe',    dot: 'bg-slate-400' },
};

const EMERGENCY_TYPES = ['medical', 'flood', 'food', 'shelter', 'rescue'];

export default function SOSDashboard() {
  const { isAdmin } = useAuth();
  const [sosList, setSosList] = useState([]);
  const [mapData, setMapData] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');
  const [submitting, setSubmitting] = useState(false);
  const [selectedSOS, setSelectedSOS] = useState(null);
  const fileRef = useRef();

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [listRes, mapRes, statsRes] = await Promise.allSettled([
        sosAPI.getAll({}),
        sosAPI.getMapData(),
        sosAPI.getStats(),
      ]);
      if (listRes.status === 'fulfilled') setSosList(listRes.value.data?.items || []);
      if (mapRes.status === 'fulfilled') setMapData(mapRes.value.data || []);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data || {});
    } catch {}
    setLoading(false);
  };

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== '') fd.append(k, v); });
      if (fileRef.current?.files[0]) fd.append('photo', fileRef.current.files[0]);
      await sosAPI.submit(fd);
      toast.success('SOS submitted! Help is on the way.');
      setShowForm(false);
      reset();
      loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await sosAPI.updateStatus(id, { status });
      toast.success(`Status updated to ${status}`);
      loadAll();
    } catch { toast.error('Update failed'); }
  };

  const getLocation = () => {
    if (!navigator.geolocation) return toast.error('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setValue('latitude', parseFloat(pos.coords.latitude.toFixed(6)));
        setValue('longitude', parseFloat(pos.coords.longitude.toFixed(6)));
        toast.success(`Location captured: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      () => toast.error('Could not get location')
    );
  };

  const filtered = filter === 'all' ? sosList : sosList.filter(s => s.status === filter);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" /> SOS Emergency Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Submit and track emergency rescue requests</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-danger">
          <Plus className="w-4 h-4" /> Submit SOS
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: stats.total ?? 0, color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' },
          { label: 'Pending', value: stats.pending ?? 0, color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
          { label: 'Accepted', value: stats.accepted ?? 0, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
          { label: 'Rescued', value: stats.rescued ?? 0, color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
        ].map((s, i) => (
          <div key={i} className={`rounded-2xl p-4 ${s.color} flex items-center gap-3`}>
            <span className="text-3xl font-black">{s.value}</span>
            <span className="text-sm font-medium">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Map */}
        <div className="lg:col-span-3 glass-card overflow-hidden" style={{ height: 440 }}>
          <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-500" /> Live SOS Map
            </h3>
            <span className="text-xs text-slate-500">{mapData.length} active locations</span>
          </div>
          <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: '385px' }} className="z-0">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© OpenStreetMap' />
            {mapData.map(sos => (
              <React.Fragment key={sos.id}>
                <Marker position={[sos.latitude, sos.longitude]}>
                  <Popup>
                    <div className="text-sm">
                      <strong className="text-red-600">{sos.emergency_type?.toUpperCase()}</strong>
                      <p className="mt-1">{sos.name} · {sos.phone}</p>
                      <p className="text-xs text-gray-500">{sos.location}</p>
                      <span className={`text-xs font-medium ${sos.status === 'pending' ? 'text-yellow-600' : 'text-green-600'}`}>
                        {sos.status}
                      </span>
                    </div>
                  </Popup>
                </Marker>
                <Circle center={[sos.latitude, sos.longitude]} radius={500}
                  pathOptions={{ color: sos.status === 'pending' ? '#ef4444' : '#3b82f6', fillOpacity: 0.1 }} />
              </React.Fragment>
            ))}
          </MapContainer>
        </div>

        {/* SOS List */}
        <div className="lg:col-span-2">
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 flex-wrap">
                {['all', 'pending', 'accepted', 'rescued'].map(s => (
                  <button key={s} onClick={() => setFilter(s)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize ${filter === s ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                    {s}
                  </button>
                ))}
                <button onClick={loadAll} className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
              {loading ? (
                <div className="p-4 space-y-3">{[0,1,2].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className="text-sm">No {filter !== 'all' ? filter : ''} SOS requests</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {filtered.map(sos => {
                    const sc = STATUS_COLORS[sos.status] || STATUS_COLORS.pending;
                    return (
                      <div key={sos.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${sc.badge}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} /> {sos.status}
                              </span>
                              <span className="badge-danger text-xs capitalize">{sos.emergency_type}</span>
                            </div>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{sos.name}</p>
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3" /> {sos.phone}
                            </p>
                            {sos.location && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate"><MapPin className="w-3 h-3 flex-shrink-0" />{sos.location}</p>}
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3" /> {format(new Date(sos.created_at), 'dd MMM HH:mm')}
                            </p>
                          </div>
                          {isAdmin && sos.status === 'pending' && (
                            <div className="flex flex-col gap-1 flex-shrink-0">
                              <button onClick={() => updateStatus(sos.id, 'accepted')} className="text-xs px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 whitespace-nowrap">Accept</button>
                              <button onClick={() => updateStatus(sos.id, 'rescued')} className="text-xs px-2 py-1 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 whitespace-nowrap">Rescued</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SOS Submit Modal */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setShowForm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass-card w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
                <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" /> Emergency SOS Request
                </h2>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Full Name *</label>
                      <input {...register('name', { required: 'Required' })} className="input-base" placeholder="Your name" />
                      {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phone *</label>
                      <input {...register('phone', { required: 'Required' })} className="input-base" placeholder="9876543210" />
                      {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Emergency Type *</label>
                    <select {...register('emergency_type', { required: 'Required' })} className="input-base">
                      <option value="">Select type...</option>
                      {EMERGENCY_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                    {errors.emergency_type && <p className="text-red-500 text-xs mt-1">{errors.emergency_type.message}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Location</label>
                    <div className="relative">
                      <input {...register('location')} className="input-base pr-10" placeholder="Area / landmark" />
                      <button type="button" onClick={getLocation} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-blue-100 text-blue-500">
                        <Navigation className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Latitude</label>
                      <input {...register('latitude')} type="number" step="any" className="input-base" placeholder="e.g. 20.5937" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Longitude</label>
                      <input {...register('longitude')} type="number" step="any" className="input-base" placeholder="e.g. 78.9629" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</label>
                    <textarea {...register('description')} rows={3} className="input-base resize-none" placeholder="Describe the situation..." />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Upload Photo</label>
                    <label className="flex items-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 cursor-pointer hover:border-blue-400 transition-colors">
                      <Camera className="w-5 h-5 text-slate-400" />
                      <span className="text-xs text-slate-500">Click to upload photo (optional)</span>
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" />
                    </label>
                  </div>

                  <button type="submit" disabled={submitting} className="w-full btn-danger">
                    {submitting ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</> : <><AlertTriangle className="w-4 h-4" /> Send SOS Request</>}
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
