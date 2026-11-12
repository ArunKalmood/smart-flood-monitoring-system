import React from 'react';
import { motion } from 'framer-motion';
import { Waves } from 'lucide-react';
import { translate } from '../../i18n';

export default function PageLoader({ message }) {
  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-900 flex flex-col items-center justify-center z-50" role="status">
      <motion.div
        animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mb-4 shadow-lg"
      >
        <Waves className="w-8 h-8 text-white" aria-hidden="true" />
      </motion.div>
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.div key={i} className="w-2 h-2 bg-blue-500 rounded-full"
            animate={{ y: [0, -8, 0] }} transition={{ duration: 0.6, delay: i * 0.1, repeat: Infinity }} />
        ))}
      </div>
      <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">{message || translate('loading')}</p>
    </div>
  );
}
