import { can, roleOf } from '../permissions';
import { DASHBOARD_PAGES, pagesFor } from '../navigation';

const user = (role, user_type = 'user') => ({ role, user_type });
const paths = (u) => pagesFor(u).map((p) => p.path);

const ADMIN_ONLY_PAGES = [
  '/dashboard/volunteers', '/dashboard/evacuation', '/dashboard/reports', '/dashboard/resources',
];

describe('route guards / sidebar', () => {
  test('public users cannot reach admin pages', () => {
    const visible = paths(user('public_user'));
    ADMIN_ONLY_PAGES.forEach((p) => expect(visible).not.toContain(p));
    expect(visible).toContain('/dashboard/sos');
  });

  test('legacy "admin" role on a user account grants nothing', () => {
    expect(roleOf(user('admin'))).toBe('public_user');
    ADMIN_ONLY_PAGES.forEach((p) => expect(paths(user('admin'))).not.toContain(p));
  });

  test('government authority and district admin reach management pages', () => {
    ADMIN_ONLY_PAGES.forEach((p) => {
      expect(paths(user('government_authority'))).toContain(p);
      expect(paths(user('district_admin', 'admin'))).toContain(p);
    });
  });

  test('analyst is read-only: sees reports, cannot manage evacuation centers', () => {
    const analyst = user('analyst', 'admin');
    expect(paths(analyst)).toContain('/dashboard/reports');
    expect(paths(analyst)).not.toContain('/dashboard/evacuation');
    expect(can(analyst, 'sos.update_status')).toBe(false);
  });

  test('signed-out users get nothing', () => {
    expect(pagesFor(null)).toEqual([]);
  });

  test('every page permission exists in the matrix', () => {
    DASHBOARD_PAGES.filter((p) => p.permission).forEach((p) => {
      expect(() => can(user('super_admin', 'admin'), p.permission)).not.toThrow();
    });
  });
});
