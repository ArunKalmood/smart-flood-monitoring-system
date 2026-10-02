import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import {
  Users, User, Phone, Mail, Heart, Droplets, MapPin,
  Upload, CheckCircle, Waves, Clock, Info
} from 'lucide-react';
import { volunteerAPI } from '../../services/api';
import toast from 'react-hot-toast';

const SKILLS = [
  { key: 'medical', label: 'Medical Aid' },
  { key: 'rescue', label: 'Water Rescue' },
  { key: 'cooking', label: 'Food Preparation' },
  { key: 'driving', label: 'Driving' },
  { key: 'boat_handling', label: 'Boat Handling' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function VolunteerRegister() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, watch } = useForm({
    defaultValues: { availability: true }
  });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const skills = SKILLS.filter(s => data[`skill_${s.key}`]).map(s => s.key);
      const payload = {
        full_name: data.full_name, email: data.email, phone: data.phone,
        blood_group: data.blood_group, skills, location: data.location,
        availability: data.availability, organization: data.organization,
      };
      await volunteerAPI.register(payload);
      setSubmitted(true);
      toast.success('Volunteer registration submitted!');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-950 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Registration Submitted!</h2>
          <p className="text-slate-300 text-sm mb-6">Your volunteer registration is pending admin approval. You'll be notified once approved.</p>
          <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all">
            <Waves className="w-4 h-4" /> Back to Home
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 py-12">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <Users className="w-9 h-9 text-green-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Join as Volunteer</h1>
          <p className="text-slate-300 text-sm max-w-md mx-auto">
            Register to help your community during flood emergencies. Your skills can save lives.
          </p>
        </motion.div>

        {/* Form */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Personal Info */}
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Personal Information</h3>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input {...register('full_name', { required: 'Required', minLength: { value: 2, message: 'Too short' } })}
                    placeholder="Your full name" className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                </div>
                {errors.full_name && <p className="text-red-400 text-xs mt-1">{errors.full_name.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Email *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="email" {...register('email', { required: 'Required' })}
                    placeholder="email@example.com" className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                </div>
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Phone *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input {...register('phone', { required: 'Required', minLength: { value: 10, message: 'Min 10 digits' } })}
                    placeholder="9876543210" className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                </div>
                {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Blood Group</label>
                <div className="relative">
                  <Droplets className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                  <select {...register('blood_group')} className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm">
                    <option value="" className="text-slate-900">Select blood group</option>
                    {BLOOD_GROUPS.map(bg => <option key={bg} value={bg} className="text-slate-900">{bg}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Skills */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">Skills & Expertise</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SKILLS.map(sk => (
                  <label key={sk.key} className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-all has-[:checked]:border-green-500 has-[:checked]:bg-green-500/10">
                    <input type="checkbox" {...register(`skill_${sk.key}`)} className="w-4 h-4 accent-green-500" />
                    <span className="text-slate-300 text-xs">{sk.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Location */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Location</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input {...register('location')} placeholder="City / Area"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Organization</label>
                <input {...register('organization')} placeholder="NGO / Company (optional)"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm" />
              </div>
            </div>

            {/* Availability */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-sm font-medium text-white">Available for deployment</p>
                  <p className="text-xs text-slate-400">Can be called to action during emergencies</p>
                </div>
              </div>
              <input type="checkbox" {...register('availability')} className="w-5 h-5 accent-green-500" />
            </div>

            {/* Upload ID */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Upload ID Document (optional)</label>
              <label className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border-2 border-dashed border-white/20 cursor-pointer hover:border-green-400 transition-colors">
                <Upload className="w-5 h-5 text-slate-400" />
                <span className="text-xs text-slate-400">Click to upload ID / Aadhar / Driving License</span>
                <input type="file" className="hidden" />
              </label>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
                : <><Heart className="w-4 h-4" /> Register as Volunteer</>
              }
            </button>

            <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300">Your registration will be reviewed by an admin. You'll receive email confirmation once approved. Status: Pending → Approved → Active.</p>
            </div>
          </form>
        </motion.div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Already have an account? <Link to="/login" className="text-blue-400 hover:text-blue-300">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
