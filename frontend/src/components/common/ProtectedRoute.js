import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import toast from '../../utils/toast';
import { translate } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../config/permissions';
import PageLoader from './PageLoader';

function AccessDenied({ redirectTo = '/dashboard' }) {
  useEffect(() => {
    toast.error(translate('error_page_forbidden'), { id: 'route-access-denied' });
  }, []);
  return <Navigate to={redirectTo} replace />;
}

/**
 * Requires a signed-in user and, if given, a permission from config/permissions.js.
 * This is UX only — the backend enforces the same permissions on every endpoint.
 */
export default function ProtectedRoute({ children, permission = null, redirectTo = '/dashboard' }) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!can(user, permission)) return <AccessDenied redirectTo={redirectTo} />;

  return children;
}
