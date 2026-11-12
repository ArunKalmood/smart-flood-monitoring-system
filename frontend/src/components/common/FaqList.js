import React, { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';

/** Accessible accordion: each question is a <button aria-expanded> controlling its answer. */
export default function FaqList({ items }) {
  const [open, setOpen] = useState(null);
  const baseId = useId();
  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const expanded = open === i;
        const panelId = `${baseId}-${i}`;
        return (
          <div key={item.q} className="public-card overflow-hidden">
            <h3>
              <button type="button" aria-expanded={expanded} aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : i)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left text-sm font-medium text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                {item.q}
                <ChevronRight className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
              </button>
            </h3>
            <div id={panelId} hidden={!expanded} className="px-4 pb-4 text-sm text-slate-600 dark:text-slate-400">
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
