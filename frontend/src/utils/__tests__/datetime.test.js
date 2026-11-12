import { ageInMinutes, formatDate, formatDateTime, formatRelative, formatTime, parseDate } from '../datetime';

const IST = { timeZone: 'Asia/Kolkata' };

describe('datetime', () => {
  test('timestamps without a zone are treated as UTC (old rows)', () => {
    expect(formatDateTime('2026-10-02T11:36:00', IST)).toBe('02 Oct 2026, 17:06');
    expect(formatDateTime('2026-10-02 11:36:00.123456', IST)).toBe('02 Oct 2026, 17:06');
  });

  test('timestamps with Z or an offset are respected', () => {
    expect(formatDateTime('2026-10-02T11:36:00Z', IST)).toBe('02 Oct 2026, 17:06');
    expect(formatDateTime('2026-10-02T11:36:00+00:00', IST)).toBe('02 Oct 2026, 17:06');
    expect(formatDateTime('2026-10-02T17:06:00+05:30', IST)).toBe('02 Oct 2026, 17:06');
  });

  test('date and time only', () => {
    expect(formatDate('2026-10-02T20:00:00Z', IST)).toBe('03 Oct 2026');
    expect(formatTime('2026-10-02T11:36:00Z', IST)).toBe('17:06');
  });

  test('missing or invalid values render as a dash', () => {
    [null, undefined, '', 'not a date'].forEach((v) => {
      expect(formatDateTime(v)).toBe('—');
      expect(formatRelative(v)).toBe('—');
    });
    expect(parseDate('garbage')).toBeNull();
    expect(ageInMinutes(null)).toBeNull();
  });

  test('relative time and age', () => {
    const now = new Date('2026-10-02T12:00:00Z');
    expect(formatRelative('2026-10-02T11:55:00Z', now)).toBe('5 minutes ago');
    expect(formatRelative('2026-10-02T09:00:00', now)).toBe('3 hours ago');
    expect(ageInMinutes('2026-10-02T11:30:00Z', now)).toBe(30);
  });
});
