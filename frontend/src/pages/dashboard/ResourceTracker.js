import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Package, Truck, Heart, Box, Users, Shield, Flame,
  Plus, Edit2, Trash2, MapPin, CheckCircle, X, RefreshCw
} from 'lucide-react';
import { resourceAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const RESOURCE_TYPES = [
  { type: 'boat', label: 'Boats', icon: Truck, color: 'blue' },
  { type: 'ambulance', label: 'Ambulances', icon: Heart, color: 'red' },
  { type: 'food_kit', label: 'Food Kits', icon: Box, color: 'amber' },
  { type: 'medical_kit', label: 'Medical Kits', icon: Heart, color: 'green' },
  { type: 'volunteer', label: 'Volunteers', icon: Users, color: 'purple' },
  { type: 'police', label: 'Police', icon: Shield, color: 'blue' },
  { type: 'fire_department', label: 'Fire Dept.', icon: Flame, color: 'orange' },
];

const COLOR_MAP = {
  blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
  amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800',
  purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800',
};

const MOCK_RESOURCES = [
  { id: 1, name: 'Rescue Boat Alpha', type: 'boat', quantity_total: 3, quantity_available: 2, current_location: 'Base Camp North', assigned_team: 'Team A', is_available: true },
  { id: 2, name: 'Ambulance Unit 1', type: 'ambulance', quantity_total: 5, quantity_available: 3, current_location: 'City Hospital', assigned_team: 'Medical Team', is_available: true },
  { id: 3, name: 'Emergency Food Kit', type: 'food_kit', quantity_total: 500, quantity_available: 420, current_location: 'Relief Center 1', assigned_team: null, is_available: true },
  { id: 4, name: 'First Aid Kit Batch A', type: 'medical_kit', quantity_total: 200, quantity_available: 150, current_location: 'Relief Center 2', assigned_team: 'Medical Team', is_available: true },
  { id: 5, name: 'Volunteer Group Alpha', type: 'volunteer', quantity_total: 45, quantity_available: 30, current_location: 'Assembly Point', assigned_team: null, is_available: true },
  { id: 6, name: 'Police Unit Delta', type: 'police', quantity_total: 20, quantity_available: 12, current_location: 'Police HQ', assigned_team: 'Law Enforcement', is_available: true },
];

export default function ResourceTracker() {
  const { isAdmin } = useAuth();
  const [resources, setResources] = useState(MOCK_RESOURCES);
  const [activeType, setActiveType] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  useEffect(() => { loadResources(); }, []);

  const loadResources = async () => {
    try {
      const res = await resourceAPI.getAll();
      if (res.data?.length > 0) setResources(res.data);
    } catch {}
    setLoading(false);
  };

  const openEdit = (r) => {
    setEditing(r);
    Object.entries(r).forEach(([k, v]) => setValue(k, v));
    setShowForm(true);
  };

  const onSubmit = async (data) => {
    try {
      if (editing) {
        await resourceAPI.update(editing.id, data);
        toast.success('Resource updated');
      } else {
        await resourceAPI.create(data);
        toast.success('Resource added');
      }
      setShowForm(false);
      setEditing(null);
      reset();
      loadResources();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Operation failed');
    }
  };

  const deleteResource = async (id) => {
    if (!window.confirm('Delete this resource?')) return;
    try {
      await resourceAPI.delete(id);
      toast.success('Resource deleted');
      loadResources();
    } catch { toast.error('Delete failed'); }
  };

  const filtered = activeType === 'all' ? resources : resources.filter(r => r.type === activeType);

  const summaryByType = RESOURCE_TYPES.map(t => ({
    ...t,
    total: resources.filter(r => r.type === t.type).reduce((s, r) => s + (r.quantity_total || 0), 0),
    available: resources.filter(r => r.type === t.type).reduce((s, r) => s + (r.quantity_available || 0), 0),
  }));

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Emergency Resource Tracker</h1>
          <p className="text-slate-500 text-sm mt-0.5">Monitor and manage emergency response assets</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditing(null); reset(); setShowForm(true); }} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Resource
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {summaryByType.map((t, i) => (
          <motion.button
            key={t.type}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => setActiveType(activeType === t.type ? 'all' : t.type)}
            className={`glass-card p-3 text-center border-2 transition-all ${activeType === t.type ? 'border-blue-500 dark:border-blue-400' : 'border-transparent'}`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2 border ${COLOR_MAP[t.color]}`}>
              <t.icon className="w-4 h-4" />
            </div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{t.label}</p>
            <p className="text-lg font-bold text-slate-800 dark:text-white">{t.available}</p>
            <p className="text-xs text-slate-400">/{t.total} avail.</p>
          </motion.button>
        ))}
      </div>

      {/* Resource Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {activeType === 'all' ? 'All Resources' : RESOURCE_TYPES.find(t => t.type === activeType)?.label} ({filtered.length})
          </h3>
          <button onClick={loadResources} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="table-container">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                {['Resource', 'Type', 'Available', 'Location', 'Team', 'Status', ...(isAdmin ? ['Actions'] : [])].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={isAdmin ? 7 : 6} className="p-4"><div className="skeleton h-8 rounded" /></td></tr>
                  ))
                : filtered.map(r => {
                    const typeInfo = RESOURCE_TYPES.find(t => t.type === r.type);
                    const avPercent = r.quantity_total > 0 ? Math.round((r.quantity_available / r.quantity_total) * 100) : 0;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.name}</td>
                        <td className="px-4 py-3">
                          {typeInfo && (
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${COLOR_MAP[typeInfo.color]}`}>
                              <typeInfo.icon className="w-3 h-3" /> {typeInfo.label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{r.quantity_available}/{r.quantity_total}</span>
                            <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${avPercent > 50 ? 'bg-green-500' : avPercent > 20 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${avPercent}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{r.current_location || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{r.assigned_team || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={r.is_available ? 'badge-safe' : 'badge-danger'}>
                            {r.is_available ? 'Available' : 'Deployed'}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteResource(r.id)} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-800 dark:text-white">{editing ? 'Edit Resource' : 'Add Resource'}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name *</label>
                <input {...register('name', { required: true })} className="input-base" placeholder="Resource name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Type *</label>
                  <select {...register('type', { required: true })} className="input-base">
                    {RESOURCE_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Total Qty</label>
                  <input {...register('quantity_total')} type="number" className="input-base" placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Available Qty</label>
                  <input {...register('quantity_available')} type="number" className="input-base" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Location</label>
                  <input {...register('current_location')} className="input-base" placeholder="Location" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Assigned Team</label>
                <input {...register('assigned_team')} className="input-base" placeholder="Team name (optional)" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-outline flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">{editing ? 'Update' : 'Add'}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
