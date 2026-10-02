import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Plus, Edit2, Trash2, Users, Utensils, Heart,
  Phone, MapPin, CheckCircle, X, Search, RefreshCw
} from 'lucide-react';
import { evacuationAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const STATUS_MAP = {
  open: 'badge-safe', full: 'badge-warning', closed: 'badge-danger'
};

const MOCK_CENTERS = [
  { id: 1, name: 'City Sports Complex', address: 'MG Road, District 1', capacity: 500, current_occupancy: 340, food_available: true, medical_available: true, contact_number: '9876543210', status: 'open', latitude: 20.59, longitude: 78.96 },
  { id: 2, name: 'Government School No. 5', address: 'North Zone, District 2', capacity: 200, current_occupancy: 190, food_available: true, medical_available: false, contact_number: '9876500001', status: 'full', latitude: 20.62, longitude: 79.01 },
  { id: 3, name: 'Community Hall East', address: 'East Block, District 3', capacity: 300, current_occupancy: 0, food_available: false, medical_available: false, contact_number: '9876500002', status: 'open', latitude: 20.55, longitude: 78.92 },
  { id: 4, name: 'Relief Camp Delta', address: 'Riverside Area, District 4', capacity: 1000, current_occupancy: 650, food_available: true, medical_available: true, contact_number: '9876500003', status: 'open', latitude: 20.68, longitude: 79.08 },
];

export default function EvacuationCenter() {
  const { isAdmin } = useAuth();
  const [centers, setCenters] = useState(MOCK_CENTERS);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  useEffect(() => { loadCenters(); }, []);

  const loadCenters = async () => {
    try {
      const res = await evacuationAPI.getAll();
      if (res.data?.length > 0) setCenters(res.data);
    } catch {}
    setLoading(false);
  };

  const openEdit = (c) => {
    setEditing(c);
    Object.entries(c).forEach(([k, v]) => setValue(k, v));
    setShowForm(true);
  };

  const onSubmit = async (data) => {
    try {
      if (editing) {
        await evacuationAPI.update(editing.id, data);
        toast.success('Center updated');
      } else {
        await evacuationAPI.create(data);
        toast.success('Center added');
      }
      setShowForm(false); setEditing(null); reset(); loadCenters();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed');
    }
  };

  const deleteCenter = async (id) => {
    if (!window.confirm('Delete this center?')) return;
    try {
      await evacuationAPI.delete(id);
      toast.success('Center deleted');
      loadCenters();
    } catch { toast.error('Failed'); }
  };

  const filtered = centers.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.address?.toLowerCase().includes(search.toLowerCase())
  );

  const totalCapacity = centers.reduce((s, c) => s + (c.capacity || 0), 0);
  const totalOccupancy = centers.reduce((s, c) => s + (c.current_occupancy || 0), 0);

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Home className="w-5 h-5 text-purple-500" /> Evacuation Center Management
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage relief camps and shelter capacity</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditing(null); reset(); setShowForm(true); }} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Center
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Centers', value: centers.length, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
          { label: 'Open', value: centers.filter(c => c.status === 'open').length, color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
          { label: 'Total Capacity', value: totalCapacity.toLocaleString(), color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
          { label: 'Occupied', value: `${totalOccupancy.toLocaleString()} (${totalCapacity ? Math.round(totalOccupancy / totalCapacity * 100) : 0}%)`, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
        ].map((s, i) => (
          <div key={i} className={`rounded-2xl p-4 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm font-medium mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="glass-card p-4 mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search centers..." className="input-base pl-9" />
        </div>
      </div>

      {/* Center Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-52 rounded-2xl" />)
          : filtered.map((c, i) => {
              const occupancyPct = c.capacity > 0 ? Math.round((c.current_occupancy / c.capacity) * 100) : 0;
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-white">{c.name}</h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{c.address}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`${STATUS_MAP[c.status] || 'badge-info'} capitalize`}>{c.status}</span>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteCenter(c.id)} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Occupancy bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>{c.current_occupancy} occupied</span>
                      <span>{c.capacity} capacity ({occupancyPct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${occupancyPct > 90 ? 'bg-red-500' : occupancyPct > 70 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${occupancyPct}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Utensils className={`w-3.5 h-3.5 ${c.food_available ? 'text-green-500' : 'text-slate-300 dark:text-slate-600'}`} />
                      <span className={c.food_available ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}>Food</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <Heart className={`w-3.5 h-3.5 ${c.medical_available ? 'text-green-500' : 'text-slate-300 dark:text-slate-600'}`} />
                      <span className={c.medical_available ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}>Medical</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <Phone className="w-3.5 h-3.5 text-blue-500" />
                      <a href={`tel:${c.contact_number}`} className="text-blue-600 dark:text-blue-400 hover:underline">{c.contact_number}</a>
                    </div>
                  </div>
                </motion.div>
              );
            })
        }
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-800 dark:text-white">{editing ? 'Edit Center' : 'Add Evacuation Center'}</h2>
                <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Center Name *</label>
                  <input {...register('name', { required: true })} className="input-base" placeholder="e.g. City Sports Complex" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Address</label>
                  <input {...register('address')} className="input-base" placeholder="Full address" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Capacity *</label>
                    <input {...register('capacity', { required: true, min: 1 })} type="number" className="input-base" placeholder="500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Current Occupancy</label>
                    <input {...register('current_occupancy')} type="number" className="input-base" placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Latitude</label>
                    <input {...register('latitude')} type="number" step="any" className="input-base" placeholder="20.5937" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Longitude</label>
                    <input {...register('longitude')} type="number" step="any" className="input-base" placeholder="78.9629" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Contact Number</label>
                  <input {...register('contact_number')} className="input-base" placeholder="9876543210" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Status</label>
                  <select {...register('status')} className="input-base">
                    <option value="open">Open</option>
                    <option value="full">Full</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
                    <input {...register('food_available')} type="checkbox" className="w-4 h-4 accent-green-500" /> Food Available
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
                    <input {...register('medical_available')} type="checkbox" className="w-4 h-4 accent-red-500" /> Medical Available
                  </label>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn-outline flex-1">Cancel</button>
                  <button type="submit" className="btn-primary flex-1">{editing ? 'Update' : 'Create'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
