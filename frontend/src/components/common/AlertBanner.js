import React from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const icons = {
  success: { Icon: CheckCircle, cls: 'text-green-500 bg-green-50 dark:bg-green-900/20' },
  error:   { Icon: XCircle,     cls: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
  warning: { Icon: AlertTriangle, cls: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
  info:    { Icon: Info,        cls: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
};

export default function AlertBanner({ type = 'info', title, message, onClose, className = '' }) {
  const { Icon, cls } = icons[type] || icons.info;
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={`flex items-start gap-3 p-4 rounded-xl border ${cls} border-current/20 ${className}`}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-medium text-sm mb-0.5">{title}</p>}
        {message && <p className="text-sm opacity-80">{message}</p>}
      </div>
      {onClose && (
        <button onClick={onClose} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
          <X className="w-4 h-4" />
        </button>
      )}
    </motion.div>
  );
}
