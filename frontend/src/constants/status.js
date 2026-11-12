/** Display config for statuses shared by several pages (labels are i18n keys). */

export const RISK_STYLES = {
  safe:    { color: 'green', text: 'text-green-600 dark:text-green-400', fill: '#22c55e', labelKey: 'risk_safe' },
  warning: { color: 'amber', text: 'text-amber-600 dark:text-amber-400', fill: '#f59e0b', labelKey: 'risk_warning' },
  danger:  { color: 'red',   text: 'text-red-600 dark:text-red-400',     fill: '#ef4444', labelKey: 'risk_danger' },
};
export const RISK_LEVELS = ['safe', 'warning', 'danger'];

/** SOS: "active" = pending + accepted + in_progress (same definition as the backend). */
export const SOS_ACTIVE_STATUSES = ['pending', 'accepted', 'in_progress'];
export const SOS_STATUS_STYLES = {
  pending:     { badge: 'badge-pending', dot: 'bg-yellow-500', pin: '#ef4444' },
  accepted:    { badge: 'badge-info',    dot: 'bg-blue-500',   pin: '#3b82f6' },
  in_progress: { badge: 'badge-info',    dot: 'bg-indigo-500', pin: '#6366f1' },
  rescued:     { badge: 'badge-safe',    dot: 'bg-green-500',  pin: '#22c55e' },
  resolved:    { badge: 'badge-safe',    dot: 'bg-green-600',  pin: '#16a34a' },
  cancelled:   { badge: 'badge-danger',  dot: 'bg-slate-400',  pin: '#94a3b8' },
};
/** Button style for each "move to" action. */
export const SOS_ACTION_STYLES = {
  accepted:    'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300',
  rescued:     'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300',
  resolved:    'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled:   'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300',
};

export const EMERGENCY_TYPES = ['medical', 'flood', 'food', 'shelter', 'rescue'];
export const FEEDBACK_CATEGORIES = ['flood_report', 'infrastructure', 'sos_issue', 'general', 'suggestion', 'complaint'];
export const FEEDBACK_PRIORITIES = ['low', 'medium', 'high', 'critical'];
export const FEEDBACK_STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'resolved'];

export const SEVERITY_STYLES = {
  critical: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-300',
  high:     'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-300',
  medium:   'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800/40 dark:text-amber-300',
  low:      'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800/40 dark:text-blue-300',
};

/** Translate a status-like value with a key prefix, falling back to a readable form. */
export const labelFor = (t, prefix, value) => {
  if (!value) return '—';
  const key = `${prefix}_${value}`;
  const text = t(key);
  return text === key ? value.replace(/_/g, ' ') : text;
};

export const VOLUNTEER_SKILLS = ['medical', 'rescue', 'cooking', 'driving', 'boat_handling'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const VOLUNTEER_STATUS_BADGE = { pending: 'badge-pending', approved: 'badge-safe', rejected: 'badge-danger', suspended: 'badge-warning' };
/** Actions an approver can take from each status (mirrors VOLUNTEER_TRANSITIONS on the backend). */
export const VOLUNTEER_ACTIONS = {
  pending: ['approved', 'rejected'],
  approved: ['suspended'],
  suspended: ['approved'],
  rejected: ['approved'],
};

export const RESOURCE_TYPES = ['boat', 'ambulance', 'food_kit', 'medical_kit', 'volunteer', 'police', 'fire_department'];
export const CENTER_STATUSES = ['open', 'full', 'closed'];
