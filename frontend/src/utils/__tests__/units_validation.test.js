import { formatNumber, formatReading, unitFor } from '../units';
import { isValidEmail, PASSWORD_CHECKS, PHONE_PATTERN, latitudeRules, passwordRules, phoneRules } from '../validation';

describe('units', () => {
  test('unit falls back to the sensor type default; never "Null"', () => {
    expect(unitFor('water_level', null)).toBe('m');
    expect(unitFor('water_level', 'Null')).toBe('m');
    expect(unitFor('rainfall', undefined)).toBe('mm/h');
    expect(unitFor('flow', '')).toBe('m/s');
    expect(unitFor('humidity', '%')).toBe('%');
    expect(unitFor('mystery', null)).toBe('');
  });

  test('numbers are rounded and missing values are a dash', () => {
    expect(formatNumber(2.566851798326966)).toBe('2.57');
    expect(formatReading(4.4999, 'water_level', null)).toBe('4.5 m');
    expect(formatReading(null, 'water_level', 'm')).toBe('—');
    expect(formatReading(NaN, 'rainfall')).toBe('—');
  });
});

describe('validation (mirrors the backend)', () => {
  test('Indian mobile numbers', () => {
    ['9876543210', '+919876543210', '+91 9876543210', '+91-9876543210'].forEach((p) => expect(PHONE_PATTERN.test(p)).toBe(true));
    ['abc', '12345', '5876543210', '+1 9876543210', '98765432101'].forEach((p) => expect(PHONE_PATTERN.test(p)).toBe(false));
    expect(phoneRules().validate('abc')).not.toBe(true);
    expect(phoneRules({ optional: true }).validate('')).toBe(true);
  });

  test('emails the backend would reject are caught before submit', () => {
    expect(isValidEmail('x@example.test')).toBe(false);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('name@example.com')).toBe(true);
  });

  test('one password policy', () => {
    expect(PASSWORD_CHECKS).toHaveLength(5);
    expect(passwordRules().validate('Str0ng!pass')).toBe(true);
    expect(passwordRules().validate('weakpass')).toMatch(/uppercase/);
  });

  test('latitude range', () => {
    expect(latitudeRules().validate('999')).not.toBe(true);
    expect(latitudeRules().validate('19.07')).toBe(true);
    expect(latitudeRules().validate('')).toBe(true);
  });
});
