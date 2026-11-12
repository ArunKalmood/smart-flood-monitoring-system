/**
 * Shared Emergency Contacts Directory
 * Single source of truth for emergency numbers across FloodMonitor.
 * Numbers and labels must not be altered.
 */

export const EMERGENCY_NUMBERS = [
  { nameKey: 'contact_emergency', typeKey: 'contact_type_all', number: '112' },
  { nameKey: 'contact_disaster', typeKey: 'contact_type_toll_free', number: '1078' },
  { nameKey: 'contact_ambulance', typeKey: 'contact_type_medical', number: '108' },
  { nameKey: 'contact_police', typeKey: 'contact_type_police', number: '100' },
  { nameKey: 'contact_fire', typeKey: 'contact_type_fire', number: '101' },
  { nameKey: 'contact_state', typeKey: 'contact_type_state', number: '1070' },
  { nameKey: 'contact_ndrf', typeKey: 'contact_type_national', number: '011-23438091' },
];

/** Top two emergency contact numbers for high-visibility highlights */
export const TOP_EMERGENCY_NUMBERS = EMERGENCY_NUMBERS.slice(0, 2);
