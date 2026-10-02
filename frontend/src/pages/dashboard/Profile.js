import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Phone, MapPin, Lock, Save, Eye, EyeOff, Bell, Globe, Palette, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useForm } from 'react-hook-form';
import { userAPI, authAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState({ current: false, new: false });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      full_name: user?.full_name || user?.name || '',
      phone: user?.phone || '',
      address: user?.address || '',
      city: user?.city || '',
      state: user?.state || '',
      pin_code: user?.pin_code || '',
    }
  });

  const { register: regPw, handleSubmit: handlePw, reset: resetPw, formState: { errors: pwErrors }, watch } = useForm();
  const newPw = watch('new_password', '');

  const onSaveProfile = async (data) => {
    setSaving(true);
    try {
      const res = await userAPI.updateProfile(data);
      updateUser(res.data);
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const onChangePassword = async (data) => {
    setSaving(true);
    try {
      await authAPI.changePassword({ current_password: data.current_password, new_password: data.new_password });
      toast.success('Password changed successfully');
      resetPw();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Password change failed');
    } finally {
      setSaving(false);
    }
  };

  const TABS = ['profile', 'security', 'notifications', 'emergency_contacts'];

  return (
    <div className="page-container max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">My Profile</h1>
        <p className="text-slate-500 text-sm mt-0.5">Manage your account details and security settings</p>
      </div>

      {/* Profile Header */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            {(user?.full_name || user?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">{user?.full_name || user?.name}</h2>
            <p className="text-slate-500 text-sm">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="badge-info capitalize">{user?.role?.replace('_', ' ') || 'User'}</span>
              {user?.is_active !== false && <span className="badge-safe flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Active</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-6">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all capitalize ${tab === t ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            {t.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {tab === 'profile' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6">
          <h3 className="font-semibold text-slate-800 dark:text-white mb-4">Personal Information</h3>
          <form onSubmit={handleSubmit(onSaveProfile)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input {...register('full_name', { required: true })} className="input-base pl-9" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phone</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input {...register('phone')} className="input-base pl-9" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={user?.email} className="input-base pl-9 opacity-60" readOnly />
              </div>
              <p className="text-xs text-slate-400 mt-1">Email cannot be changed</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input {...register('address')} className="input-base pl-9" placeholder="Street address" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">City</label>
                <input {...register('city')} className="input-base" placeholder="City" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">State</label>
                <input {...register('state')} className="input-base" placeholder="State" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">PIN Code</label>
                <input {...register('pin_code')} className="input-base" placeholder="000000" />
              </div>
            </div>
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? 'Saving...' : <><Save className="w-4 h-4" /> Save Changes</>}
            </button>
          </form>
        </motion.div>
      )}

      {/* Security Tab */}
      {tab === 'security' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6">
          <h3 className="font-semibold text-slate-800 dark:text-white mb-4">Change Password</h3>
          <form onSubmit={handlePw(onChangePassword)} className="space-y-4">
            {[
              { name: 'current_password', label: 'Current Password', key: 'current', rules: { required: 'Required' } },
              { name: 'new_password', label: 'New Password', key: 'new', rules: { required: 'Required', minLength: { value: 8, message: 'Min 8 chars' } } },
              { name: 'confirm_password', label: 'Confirm New Password', key: 'confirm', rules: { required: 'Required', validate: v => v === newPw || 'Passwords do not match' } },
            ].map(f => (
              <div key={f.name}>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{f.label}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPw[f.key] ? 'text' : 'password'}
                    {...regPw(f.name, f.rules)}
                    className="input-base pl-9 pr-10"
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowPw(p => ({ ...p, [f.key]: !p[f.key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPw[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {pwErrors[f.name] && <p className="text-red-500 text-xs mt-1">{pwErrors[f.name].message}</p>}
              </div>
            ))}
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? 'Updating...' : <><Lock className="w-4 h-4" /> Update Password</>}
            </button>
          </form>
        </motion.div>
      )}

      {/* Notifications Tab */}
      {tab === 'notifications' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6">
          <h3 className="font-semibold text-slate-800 dark:text-white mb-4">Notification Preferences</h3>
          <div className="space-y-3">
            {[
              { label: 'Flood Warnings', sub: 'Receive alerts when flood risk is detected' },
              { label: 'SOS Updates', sub: 'Get notified about SOS request status changes' },
              { label: 'Volunteer Assignments', sub: 'Notifications when volunteers are assigned' },
              { label: 'Weather Alerts', sub: 'Severe weather warnings and advisories' },
              { label: 'System Notifications', sub: 'App updates and system messages' },
            ].map((n, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-white">{n.label}</p>
                  <p className="text-xs text-slate-500">{n.sub}</p>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-blue-500" />
              </div>
            ))}
          </div>
          <button className="btn-primary mt-4 w-full"><Save className="w-4 h-4" /> Save Preferences</button>
        </motion.div>
      )}

      {/* Emergency Contacts Tab */}
      {tab === 'emergency_contacts' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6">
          <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Emergency Contacts</h3>
          <p className="text-sm text-slate-500 mb-4">These contacts will be notified in case of an emergency.</p>
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <input className="input-base" placeholder={`Contact ${i} Name`} />
                <input className="input-base" placeholder={`Contact ${i} Phone`} />
              </div>
            ))}
          </div>
          <button className="btn-primary mt-4 w-full"><Save className="w-4 h-4" /> Save Contacts</button>
        </motion.div>
      )}
    </div>
  );
}
