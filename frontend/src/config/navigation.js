/**
 * Dashboard pages: one list drives BOTH the sidebar and the route guards,
 * so a page can't be hidden in the menu yet reachable by URL (or vice versa).
 *
 * `permission` is a key of PERMISSIONS (config/permissions.js); `null` means
 * any signed-in user. Pages open to everyone still get role-scoped data from
 * the backend (e.g. public users only see their own SOS requests).
 */
import {
  LayoutDashboard, Radio, Brain, AlertTriangle, Package, Map,
  Home, Users, MessageSquare, Bell, FileText, User, Settings,
} from 'lucide-react';
import { can } from './permissions';

export const DASHBOARD_PAGES = [
  { path: '/dashboard',               labelKey: 'nav_dashboard',     icon: LayoutDashboard, permission: null },
  { path: '/dashboard/sensors',       labelKey: 'nav_sensors',       icon: Radio,           permission: null },
  { path: '/dashboard/predictions',   labelKey: 'nav_predictions',   icon: Brain,           permission: null },
  { path: '/dashboard/sos',           labelKey: 'nav_sos',           icon: AlertTriangle,   permission: null },
  { path: '/dashboard/resources',     labelKey: 'nav_resources',     icon: Package,         permission: 'resources.view' },
  { path: '/dashboard/routes',        labelKey: 'nav_routes',        icon: Map,             permission: null },
  { path: '/dashboard/evacuation',    labelKey: 'nav_evacuation',    icon: Home,            permission: 'evacuation.manage' },
  { path: '/dashboard/volunteers',    labelKey: 'nav_volunteers',    icon: Users,           permission: 'volunteers.view' },
  { path: '/dashboard/feedback',      labelKey: 'nav_feedback',      icon: MessageSquare,   permission: null },
  { path: '/dashboard/notifications', labelKey: 'nav_notifications', icon: Bell,            permission: null },
  { path: '/dashboard/reports',       labelKey: 'nav_reports',       icon: FileText,        permission: 'reports.view' },
  { path: '/dashboard/profile',       labelKey: 'nav_profile',       icon: User,            permission: null },
  { path: '/dashboard/settings',      labelKey: 'nav_settings',      icon: Settings,        permission: null },
];

export const pagesFor = (user) => DASHBOARD_PAGES.filter((p) => can(user, p.permission));

export const pageFor = (path) => DASHBOARD_PAGES.find((p) => p.path === path);
