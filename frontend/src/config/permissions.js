/**
 * Role → permission matrix. MIRRORS backend/auth/permissions.py (PERMISSIONS).
 * backend/tests/test_permissions_sync.py fails if the two differ, so edit both.
 *
 * The frontend uses this only to decide what to show. The backend enforces it.
 */

// BEGIN PERMISSIONS (JSON — keep machine-readable)
export const PERMISSIONS = {
  "sos.submit": [
    "analyst",
    "district_admin",
    "government_authority",
    "operations",
    "public_user",
    "super_admin",
    "volunteer"
  ],
  "sos.view_all": [
    "analyst",
    "district_admin",
    "government_authority",
    "operations",
    "super_admin"
  ],
  "sos.view_assigned": [
    "volunteer"
  ],
  "sos.update_status": [
    "district_admin",
    "government_authority",
    "operations",
    "super_admin",
    "volunteer"
  ],
  "feedback.view_all": [
    "analyst",
    "district_admin",
    "government_authority",
    "operations",
    "super_admin"
  ],
  "feedback.manage": [
    "district_admin",
    "government_authority",
    "operations",
    "super_admin"
  ],
  "volunteers.view": [
    "analyst",
    "district_admin",
    "government_authority",
    "operations",
    "super_admin"
  ],
  "volunteers.approve": [
    "district_admin",
    "government_authority",
    "super_admin"
  ],
  "evacuation.manage": [
    "district_admin",
    "government_authority",
    "operations",
    "super_admin"
  ],
  "resources.view": [
    "analyst",
    "district_admin",
    "government_authority",
    "operations",
    "super_admin"
  ],
  "resources.manage": [
    "district_admin",
    "government_authority",
    "operations",
    "super_admin"
  ],
  "alerts.manage": [
    "district_admin",
    "government_authority",
    "operations",
    "super_admin"
  ],
  "reports.view": [
    "analyst",
    "district_admin",
    "government_authority",
    "operations",
    "super_admin"
  ],
  "sensors.manage": [
    "district_admin",
    "operations",
    "super_admin"
  ],
  "users.view_all": [
    "district_admin",
    "super_admin"
  ],
  "users.change_role": [
    "super_admin"
  ],
  "admin.invite": [
    "super_admin"
  ],
  "audit.view": [
    "district_admin",
    "super_admin"
  ],
  "contact.view_full": [
    "district_admin",
    "government_authority",
    "operations",
    "super_admin",
    "volunteer"
  ]
};
// END PERMISSIONS

/**
 * Role used for UI decisions. Admin accounts carry their admin role; the
 * legacy `admin` value on ordinary user accounts grants nothing (as on the backend).
 */
export function roleOf(user) {
  if (!user) return null;
  if (user.role === 'admin' && user.user_type !== 'admin') return 'public_user';
  return user.role || null;
}

/** Does this user's role have the permission? `null` permission = any signed-in user. */
export function can(user, permission) {
  if (!user) return false;
  if (!permission) return true;
  const roles = PERMISSIONS[permission];
  if (!roles) throw new Error(`Unknown permission: ${permission}`);
  return roles.includes(roleOf(user));
}
