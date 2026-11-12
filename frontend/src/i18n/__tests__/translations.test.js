/**
 * Translation completeness:
 *  1. every language has exactly the English keys, with the same {placeholders};
 *  2. every key used in the source code exists;
 *  3. every dynamic key family (statuses, roles, categories…) is complete.
 */
import fs from 'fs';
import path from 'path';
import { TRANSLATIONS } from '..';
import {
  CENTER_STATUSES, EMERGENCY_TYPES, FEEDBACK_CATEGORIES, FEEDBACK_PRIORITIES, FEEDBACK_STATUSES,
  RESOURCE_TYPES, RISK_LEVELS, SOS_ACTION_STYLES, SOS_STATUS_STYLES, VOLUNTEER_ACTIONS, VOLUNTEER_SKILLS,
  VOLUNTEER_STATUS_BADGE,
} from '../../constants/status';
import { EMERGENCY_NUMBERS, FAQ_KEYS, RESOURCES, SAFETY_PHASES } from '../../constants/publicInfo';
import { DASHBOARD_PAGES } from '../../config/navigation';
import { PERMISSIONS } from '../../config/permissions';
import { PASSWORD_CHECKS } from '../../utils/validation';

const en = TRANSLATIONS.en;
const SRC = path.resolve(__dirname, '../..');
const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort();

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['i18n', '__tests__'].includes(entry.name) ? [] : sourceFiles(full);
    return full.endsWith('.js') && !full.endsWith('.test.js') ? [full] : [];
  });
}

/** Keys passed to t()/translate() — including both branches of `t(cond ? 'a' : 'b')`. */
function keysUsedInSource() {
  const keys = new Set();
  sourceFiles(SRC).forEach((file) => {
    const code = fs.readFileSync(file, 'utf8');
    for (const call of code.matchAll(/\b(?:t|translate)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
      const firstArg = call[1].split(/,\s*\{/)[0];
      // Skip values being compared in a ternary condition, e.g. t(x === 'unread' ? 'a' : 'b').
      for (const lit of firstArg.matchAll(/(?<![=!]==\s*)'([a-z][a-z0-9_]*)'/g)) keys.add(lit[1]);
    }
  });
  return keys;
}

describe('translation files', () => {
  Object.entries(TRANSLATIONS).filter(([code]) => code !== 'en').forEach(([code, dict]) => {
    test(`${code} has exactly the English keys`, () => {
      const missing = Object.keys(en).filter((k) => !(k in dict));
      const extra = Object.keys(dict).filter((k) => !(k in en));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    test(`${code} keeps every {placeholder}`, () => {
      const broken = Object.keys(en).filter((k) => k in dict && placeholders(dict[k]).join() !== placeholders(en[k]).join());
      expect(broken).toEqual([]);
    });

    test(`${code} has no empty strings`, () => {
      expect(Object.keys(dict).filter((k) => !String(dict[k]).trim())).toEqual([]);
    });
  });
});

describe('keys used by the app exist', () => {
  test('literal keys in t()/translate() calls', () => {
    const missing = [...keysUsedInSource()].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  test('keys referenced from config and constants', () => {
    const keys = [
      ...DASHBOARD_PAGES.map((p) => p.labelKey),
      ...EMERGENCY_NUMBERS.flatMap((c) => [c.nameKey, c.typeKey]),
      ...SAFETY_PHASES.flatMap((p) => [p.titleKey, ...p.tips]),
      ...FAQ_KEYS.flat(),
      ...RESOURCES.map((r) => r.titleKey),
      ...PASSWORD_CHECKS.map((c) => c.key),
      ...['flood_warnings', 'sos_updates', 'volunteer_updates', 'weather_alerts', 'system_messages'].flatMap((p) => [`pref_${p}`, `pref_${p}_hint`]),
    ];
    expect(keys.filter((k) => !(k in en))).toEqual([]);
  });

  test('dynamic key families are complete', () => {
    const roles = [...new Set(Object.values(PERMISSIONS).flat()), 'admin'];
    const families = [
      ...roles.map((r) => `role_${r}`),
      ...Object.keys(SOS_STATUS_STYLES).map((s) => `sos_status_${s}`),
      ...Object.keys(SOS_ACTION_STYLES).map((s) => `sos_action_${s}`),
      ...EMERGENCY_TYPES.map((x) => `emergency_${x}`),
      ...FEEDBACK_CATEGORIES.map((x) => `fb_cat_${x}`),
      ...FEEDBACK_PRIORITIES.map((x) => `priority_${x}`),
      ...FEEDBACK_STATUSES.map((x) => `fb_status_${x}`),
      ...['approved', 'rejected', 'resolved'].map((x) => `fb_action_${x}`),
      ...Object.keys(VOLUNTEER_STATUS_BADGE).map((x) => `vol_status_${x}`),
      ...[...new Set(Object.values(VOLUNTEER_ACTIONS).flat())].map((x) => `vol_action_${x}`), 'vol_action_reinstate',
      ...VOLUNTEER_SKILLS.map((x) => `skill_${x}`),
      ...RESOURCE_TYPES.map((x) => `res_type_${x}`),
      ...CENTER_STATUSES.map((x) => `evac_status_${x}`),
      ...RISK_LEVELS.map((x) => `risk_${x}`),
      ...['low', 'medium', 'high', 'critical'].map((x) => `severity_${x}`),
      ...['online', 'offline', 'maintenance', 'fault'].map((x) => `sensor_status_${x}`),
      ...['water_level', 'rainfall', 'temperature', 'humidity', 'flow'].map((x) => `sensor_type_${x}`),
      ...['light', 'dark', 'system'].map((x) => `settings_${x}`),
      ...['profile', 'security', 'notifications'].flatMap((x) => [`profile_tab_${x}`, `profile_tab_${x}_title`]),
      ...['flood', 'sos', 'volunteer', 'feedback', 'sensor', 'prediction'].flatMap((x) => [`rep_${x}_title`, `rep_${x}_desc`]),
      ...['newest', 'oldest', 'priority'].map((x) => `sort_${x}`),
      ...['morning', 'afternoon', 'evening'].map((x) => `dash_good_${x}`),
    ];
    expect(families.filter((k) => !(k in en))).toEqual([]);
  });
});
