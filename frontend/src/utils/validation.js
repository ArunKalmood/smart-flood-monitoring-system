/**
 * Form rules shared by every form. They mirror backend/schemas/validators.py —
 * keep the two in step.
 */
import { translate } from '../i18n';

export const PHONE_PATTERN = /^(\+91[-\s]?)?[6-9]\d{9}$/;
// Same shape the backend (pydantic EmailStr) accepts: a dot-separated domain with a TLD of 2+ letters.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
// pydantic's EmailStr rejects special-use domains such as .test/.example/.invalid/.localhost.
const RESERVED_TLDS = ['test', 'example', 'invalid', 'localhost', 'local'];

export const PASSWORD_CHECKS = [
  { key: 'pw_rule_length', test: (v) => v.length >= 8 },
  { key: 'pw_rule_upper', test: (v) => /[A-Z]/.test(v) },
  { key: 'pw_rule_lower', test: (v) => /[a-z]/.test(v) },
  { key: 'pw_rule_number', test: (v) => /\d/.test(v) },
  { key: 'pw_rule_special', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export const isValidEmail = (value) => {
  if (!EMAIL_PATTERN.test(value || '')) return false;
  const tld = value.split('.').pop().toLowerCase();
  return !RESERVED_TLDS.includes(tld);
};

export const required = () => ({ required: translate('val_required') });

export const emailRules = () => ({
  required: translate('val_required'),
  validate: (v) => isValidEmail(v) || translate('val_email'),
});

export const phoneRules = ({ optional = false } = {}) => ({
  ...(optional ? {} : { required: translate('val_required') }),
  validate: (v) => (optional && !v) || PHONE_PATTERN.test((v || '').trim()) || translate('val_phone'),
});

export const passwordRules = () => ({
  required: translate('val_required'),
  validate: (v) => {
    const missing = PASSWORD_CHECKS.filter((c) => !c.test(v || '')).map((c) => translate(c.key));
    return missing.length === 0 || translate('val_password', { rules: missing.join(', ') });
  },
});

export const confirmPasswordRules = (getPassword) => ({
  required: translate('val_required'),
  validate: (v) => v === getPassword() || translate('val_password_match'),
});

const rangeRule = (min, max, key) => ({
  validate: (v) => v === '' || v === null || v === undefined || (Number(v) >= min && Number(v) <= max) || translate(key),
});

export const latitudeRules = () => rangeRule(-90, 90, 'val_latitude');
export const longitudeRules = () => rangeRule(-180, 180, 'val_longitude');

export const pinCodeRules = () => ({
  validate: (v) => !v || /^\d{6}$/.test(v) || translate('val_pin'),
});

export const lengthRules = (min, max) => ({
  ...(min ? { minLength: { value: min, message: translate('val_min_length', { n: min }) } } : {}),
  ...(max ? { maxLength: { value: max, message: translate('val_max_length', { n: max }) } } : {}),
});

/** Both latitude and longitude, or neither (same rule as the backend). */
export const bothOrNeither = (other) => (v) =>
  (v === '' || v === undefined || v === null) === (other() === '' || other() === undefined || other() === null)
  || translate('val_coordinates_pair');
