import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquare, Plus, X, Filter, Search, CheckCircle,
  Eye, Brain, RefreshCw, Upload
} from 'lucide-react';
import { feedbackAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const CATEGORIES = ['flood_report', 'infrastructure', 'sos_issue', 'general', 'suggestion', 'complaint'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

const PRIORITY_BADGE = {
  low:      'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
  medium:   'badge-info',
  high:     'badge-warning',
  critical: 'badge-danger',
};

const STATUS_BADGE = {
  pending:      'badge-pending',
  under_review: 'badge-info',
  approved:     'badge-safe',
  rejected:     'badge-danger',
  resolved:     'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs px-2 py-0.5 rounded-full font-medium',
};

export default function FeedbackPortal() {
  const { isAdmin } = useAuth();
  const [items, setItems]         = useState([]);
  const [stats, setStats]         = useState({});
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [selected, setSelected]   = useState(null);
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [sort, setSort]           = useState('newest');
  const [submitting, setSubmitting] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const fileRef = useRef();

  const [form, setForm] = useState({
    title: '', category: '', description: '', priority: 'medium',
    location: '', is_anonymous: false, user_name: '', user_email: '',
  });

  const loadAll = useCallback(async () => {
    try {
      const params = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (filterPriority !== 'all') params.priority = filterPriority;
      if (search) params.search = search;
      params.sort = sort;

      const [fbRes, statsRes] = await Promise.allSettled([
        feedbackAPI.getAll(params),
        feedbackAPI.getStats(),
      ]);
      if (fbRes.status === 'fulfilled') setItems(fbRes.value.data?.items || []);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data || {});
    } catch {}
    setLoading(false);
  }, [filterStatus, filterPriority, sort, search]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.category || !form.description) {
      return toast.error('Please fill all required fields');
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (fileRef.current?.files[0]) fd.append('photo', fileRef.current.files[0]);
      await feedbackAPI.submit(fd);
      toast.success('Feedback submitted successfully');
      setShowForm(false);
      setForm({ title: '', category: '', description: '', priority: 'medium', location: '', is_anonymous: false, user_name: '', user_email: '' });
      loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const updateFeedback = async (id, data) => {
    try {
      await feedbackAPI.update(id, data);
      toast.success('Feedback updated');
      setSelected(null);
      loadAll();
    } catch { toast.error('Update failed'); }
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-500" /> Feedback Portal
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            LLM-ready feedback management system
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400 text-xs font-medium">
            <Brain className="w-3.5 h-3.5" /> LLM Analysis Ready
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Submit Feedback
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Feedback', value: stats.total ?? 0, color: 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white' },
          { label: 'Pending Review', value: stats.pending ?? 0, color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400' },
          { label: 'Resolved', value: stats.resolved ?? 0, color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' },
        ].map((s, i) => (
          <div key={i} className={`rounded-2xl p-4 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-card p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search feedback..."
              className="input-base pl-9" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-base w-auto text-xs">
            <option value="all">All Status</option>
            {['pending', 'under_review', 'approved', 'rejected', 'resolved'].map(s => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="input-base w-auto text-xs">
            <option value="all">All Priority</option>
            {PRIORITIES.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} className="input-base w-auto text-xs">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="priority">Priority</option>
          </select>
          <button onClick={loadAll} className="btn-outline py-2 px-3 text-xs"><RefreshCw className="w-3 h-3" /></button>
        </div>
      </div>

      {/* Feedback List */}
      <div className="glass-card overflow-hidden">
        <div className="table-container">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                {['Title', 'Category', 'Priority', 'User', 'Status', 'Date', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={7} className="p-4"><div className="skeleton h-8 rounded" /></td></tr>
                  ))
                : items.length === 0
                  ? <tr><td colSpan={7} className="text-center py-10 text-slate-400">No feedback found</td></tr>
                  : items.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800 dark:text-slate-200 max-w-xs truncate">{item.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5 max-w-xs truncate">{item.description}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 capitalize">{item.category?.replace('_', ' ')}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PRIORITY_BADGE[item.priority] || ''}`}>{item.priority}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {item.is_anonymous ? <span className="italic">Anonymous</span> : item.user_name || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`${STATUS_BADGE[item.status] || 'badge-pending'} capitalize`}>{item.status?.replace('_', ' ')}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                          {item.created_at ? format(new Date(item.created_at), 'dd MMM yyyy') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => { setSelected(item); setAdminNotes(item.admin_notes || ''); }} className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600">
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Submit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="glass-card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-800 dark:text-white">Submit Feedback</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="input-base" placeholder="Brief description" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category *</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="input-base" required>
                    <option value="">Select...</option>
                    {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="input-base">
                    {PRIORITIES.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description *</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} className="input-base resize-none" placeholder="Detailed description..." required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Location</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="input-base" placeholder="Area / location" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
                <input type="checkbox" checked={form.is_anonymous} onChange={e => setForm(f => ({ ...f, is_anonymous: e.target.checked }))} className="w-4 h-4 accent-blue-500" />
                Submit anonymously
              </label>
              {!form.is_anonymous && (
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.user_name} onChange={e => setForm(f => ({ ...f, user_name: e.target.value }))} className="input-base" placeholder="Your name" />
                  <input value={form.user_email} onChange={e => setForm(f => ({ ...f, user_email: e.target.value }))} type="email" className="input-base" placeholder="Email (optional)" />
                </div>
              )}
              <label className="flex items-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 cursor-pointer hover:border-blue-400 transition-colors">
                <Upload className="w-5 h-5 text-slate-400" />
                <span className="text-xs text-slate-500">Attach photo (optional)</span>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" />
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-outline flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1">
                  {submitting ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="glass-card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-800 dark:text-white">Feedback #{selected.id}</h2>
              <button onClick={() => { setSelected(null); setAdminNotes(''); }}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div><p className="text-xs text-slate-400">Title</p><p className="text-sm font-medium text-slate-800 dark:text-white">{selected.title}</p></div>
              <div><p className="text-xs text-slate-400">Description</p><p className="text-sm text-slate-700 dark:text-slate-300">{selected.description}</p></div>
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-xs text-slate-400">Category</p><p className="text-sm capitalize">{selected.category?.replace('_', ' ')}</p></div>
                <div><p className="text-xs text-slate-400">Priority</p><p className="text-sm capitalize">{selected.priority}</p></div>
                <div><p className="text-xs text-slate-400">Status</p><p className="text-sm capitalize">{selected.status?.replace('_', ' ')}</p></div>
              </div>
              {selected.location && <div><p className="text-xs text-slate-400">Location</p><p className="text-sm">{selected.location}</p></div>}
              <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/30">
                <p className="text-xs font-medium text-purple-700 dark:text-purple-400 flex items-center gap-1"><Brain className="w-3 h-3" /> LLM Analysis (Future)</p>
                <p className="text-xs text-purple-600 dark:text-purple-300 mt-1">AI analysis fields: severity_score, urgency, is_duplicate, auto_summary pending LLM integration.</p>
              </div>
            </div>
            {isAdmin && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Admin Notes</label>
                <textarea rows={2} placeholder="Add admin notes..." className="input-base resize-none" value={adminNotes} onChange={e => setAdminNotes(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={() => updateFeedback(selected.id, { status: 'approved', admin_notes: adminNotes })} className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-medium">Approve</button>
                  <button onClick={() => updateFeedback(selected.id, { status: 'rejected', admin_notes: adminNotes })} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-medium">Reject</button>
                  <button onClick={() => updateFeedback(selected.id, { status: 'resolved', admin_notes: adminNotes })} className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium">Resolve</button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
