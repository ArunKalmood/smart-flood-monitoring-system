import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Plus, X, CheckCircle, XCircle, Clock,
  Search, Filter, RefreshCw, Phone, MapPin, Droplets
} from 'lucide-react';
import { volunteerAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const STATUS_MAP = {
  pending:  { badge: 'badge-pending', label: 'Pending' },
  approved: { badge: 'badge-safe', label: 'Approved' },
  rejected: { badge: 'badge-danger', label: 'Rejected' },
};

const SKILLS = ['medical', 'rescue', 'cooking', 'driving', 'boat_handling'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function VolunteerMgmt() {
  const { isAdmin } = useAuth();
  const [volunteers, setVolunteers] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAdd, setShowAdd] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [vRes, sRes] = await Promise.allSettled([volunteerAPI.getAll({}), volunteerAPI.getStats()]);
      if (vRes.status === 'fulfilled') setVolunteers(vRes.value.data?.items || []);
      if (sRes.status === 'fulfilled') setStats(sRes.value.data || {});
    } catch {}
    setLoading(false);
  };

  const updateStatus = async (id, status) => {
    try {
      await volunteerAPI.updateStatus(id, status);
      toast.success(`Volunteer ${status}`);
      loadAll();
    } catch { toast.error('Failed'); }
  };

  const onRegister = async (data) => {
    try {
      const skills = SKILLS.filter(s => data[`skill_${s}`]);
      const payload = { ...data, skills };
      await volunteerAPI.register(payload);
      toast.success('Volunteer registered');
      setShowAdd(false);
      reset();
      loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Registration failed');
    }
  };

  const filtered = volunteers
    .filter(v => filterStatus === 'all' || v.status === filterStatus)
    .filter(v => !search || v.full_name?.toLowerCase().includes(search.toLowerCase()) || v.email?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-500" /> Volunteer Management
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage and approve volunteer registrations</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Register Volunteer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: stats.total ?? 0, color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' },
          { label: 'Approved', value: stats.approved ?? 0, color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
          { label: 'Pending', value: stats.pending ?? 0, color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
          { label: 'Available Now', value: stats.available ?? 0, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
        ].map((s, i) => (
          <div key={i} className={`rounded-2xl p-4 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-card p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search volunteers..." className="input-base pl-9" />
        </div>
        <div className="flex gap-2">
          {['all', 'pending', 'approved', 'rejected'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 rounded-xl text-xs font-medium capitalize transition-all ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
              {s}
            </button>
          ))}
        </div>
        <button onClick={loadAll} className="btn-outline py-2 px-3 text-xs">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="table-container">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                {['Volunteer', 'Contact', 'Blood Group', 'Skills', 'Location', 'Status', ...(isAdmin ? ['Actions'] : [])].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={isAdmin ? 7 : 6} className="p-4"><div className="skeleton h-8 rounded" /></td></tr>
                  ))
                : filtered.length === 0
                  ? <tr><td colSpan={isAdmin ? 7 : 6} className="text-center py-10 text-slate-400">No volunteers found</td></tr>
                  : filtered.map(v => {
                      const sc = STATUS_MAP[v.status] || STATUS_MAP.pending;
                      return (
                        <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {v.full_name?.charAt(0)}
                              </div>
                              <div>
                                <p className="font-medium text-slate-800 dark:text-slate-200">{v.full_name}</p>
                                <p className="text-xs text-slate-400">{v.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            <p className="flex items-center gap-1"><Phone className="w-3 h-3" />{v.phone}</p>
                          </td>
                          <td className="px-4 py-3">
                            {v.blood_group && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">
                                <Droplets className="w-3 h-3" /> {v.blood_group}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(Array.isArray(v.skills) ? v.skills : []).slice(0, 2).map((sk, i) => (
                                <span key={i} className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 capitalize">{sk.replace('_', ' ')}</span>
                              ))}
                              {(v.skills?.length ?? 0) > 2 && <span className="text-xs text-slate-400">+{v.skills.length - 2}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {v.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{v.location}</span>}
                          </td>
                          <td className="px-4 py-3"><span className={sc.badge}>{sc.label}</span></td>
                          {isAdmin && (
                            <td className="px-4 py-3">
                              {v.status === 'pending' && (
                                <div className="flex gap-1">
                                  <button onClick={() => updateStatus(v.id, 'approved')} title="Approve"
                                    className="p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600">
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => updateStatus(v.id, 'rejected')} title="Reject"
                                    className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500">
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
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

      {/* Register Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="glass-card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-800 dark:text-white">Register Volunteer</h2>
              <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit(onRegister)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Full Name *</label>
                  <input {...register('full_name', { required: true })} className="input-base" placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phone *</label>
                  <input {...register('phone', { required: true })} className="input-base" placeholder="Phone number" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Email *</label>
                  <input {...register('email', { required: true })} type="email" className="input-base" placeholder="email@example.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Blood Group</label>
                  <select {...register('blood_group')} className="input-base">
                    <option value="">Select...</option>
                    {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Skills</label>
                <div className="flex flex-wrap gap-2">
                  {SKILLS.map(sk => (
                    <label key={sk} className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 dark:text-slate-400">
                      <input type="checkbox" {...register(`skill_${sk}`)} className="accent-purple-500" />
                      <span className="capitalize">{sk.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Location</label>
                  <input {...register('location')} className="input-base" placeholder="City/Area" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Organization</label>
                  <input {...register('organization')} className="input-base" placeholder="Optional" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="btn-outline flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Register</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
