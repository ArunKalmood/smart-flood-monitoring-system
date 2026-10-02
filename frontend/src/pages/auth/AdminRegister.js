import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Shield, Lock, Mail, User, Building, KeyRound, AlertCircle, CheckCircle } from 'lucide-react';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';

const ADMIN_ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'district_admin', label: 'District Admin' },
  { value: 'operations', label: 'Operations' },
  { value: 'analyst', label: 'Analyst' },
];

export default function AdminRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=token verify, 2=register form
  const [verifying, setVerifying] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);
  const [tokenValue, setTokenValue] = useState('');
  const [tokenError, setTokenError] = useState('');

  const { register, handleSubmit, watch, formState: { errors } } = useForm({ defaultValues: { role: 'district_admin' } });
  const pw = watch('password', '');

  const verifyToken = async (e) => {
    e.preventDefault();
    setVerifying(true);
    setTokenError('');
    try {
      await authAPI.verifyToken({ token: tokenValue });
      toast.success('Token verified! Complete your registration.');
      setStep(2);
    } catch (err) {
      setTokenError(err?.response?.data?.detail || 'Invalid Admin Registration Token');
    } finally {
      setVerifying(false);
    }
  };

  const onRegister = async (data) => {
    setRegistering(true);
    try {
      const res = await authAPI.adminRegister({ ...data, registration_token: tokenValue });
      localStorage.setItem('access_token', res.data.access_token);
      localStorage.setItem('refresh_token', res.data.refresh_token);
      localStorage.setItem('user', JSON.stringify({ ...res.data.admin, user_type: 'admin' }));
      toast.success(`Admin account created! Welcome, ${res.data.admin.name}`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto mb-3">
            <Shield className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Registration</h1>
          <p className="text-slate-400 text-sm mt-1">
            {step === 1 ? 'Verification required to proceed' : 'Complete your admin profile'}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2].map(s => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${step >= s ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-slate-500 border border-white/10'}`}>
                {step > s ? <CheckCircle className="w-3 h-3" /> : <span className="w-4 h-4 rounded-full border flex items-center justify-center text-xs">{s}</span>}
                {s === 1 ? 'Verify Token' : 'Register'}
              </div>
              {s < 2 && <div className={`flex-1 h-px ${step > s ? 'bg-amber-500' : 'bg-white/10'}`} />}
            </React.Fragment>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.form key="token" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              onSubmit={verifyToken} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Admin Registration Token</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={tokenValue} onChange={e => setTokenValue(e.target.value)} placeholder="Enter 4-digit token"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/10 border ${tokenError ? 'border-red-500' : 'border-white/20'} text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm text-center tracking-widest text-lg font-mono`} />
                </div>
                {tokenError && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-xs mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {tokenError}
                  </motion.p>
                )}
                <p className="text-slate-500 text-xs mt-2">Contact your system administrator for the registration token.</p>
              </div>
              <button type="submit" disabled={verifying || !tokenValue} className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {verifying ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verifying...</> : <><KeyRound className="w-4 h-4" /> Verify Token</>}
              </button>
            </motion.form>
          ) : (
            <motion.form key="register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              onSubmit={handleSubmit(onRegister)} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" {...register('name', { required: 'Name required' })} placeholder="Admin Name"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm" />
                </div>
                {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="email" {...register('email', { required: 'Email required' })} placeholder="admin@gov.in"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm" />
                </div>
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Department</label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" {...register('department')} placeholder="Disaster Mgmt"
                      className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Role *</label>
                  <select {...register('role')} className="w-full py-2.5 px-3 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm">
                    {ADMIN_ROLES.map(r => <option key={r.value} value={r.value} className="text-slate-900">{r.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type={showPw ? 'text' : 'password'} {...register('password', { required: 'Password required', minLength: { value: 8, message: 'Min 8 chars' } })} placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Confirm Password *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type={showCPw ? 'text' : 'password'} {...register('confirm_password', { required: 'Required', validate: v => v === pw || 'Passwords do not match' })} placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm" />
                  <button type="button" onClick={() => setShowCPw(!showCPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showCPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirm_password && <p className="text-red-400 text-xs mt-1">{errors.confirm_password.message}</p>}
              </div>

              <button type="submit" disabled={registering} className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {registering ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</> : <><Shield className="w-4 h-4" /> Create Admin Account</>}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <p className="text-center text-xs text-slate-500 mt-4">
          <Link to="/admin/login" className="text-amber-400 hover:text-amber-300">← Back to Admin Login</Link>
        </p>
      </div>
    </motion.div>
  );
}
