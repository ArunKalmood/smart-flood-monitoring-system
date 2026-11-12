import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import GuestRoute from './components/common/GuestRoute';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import { LanguageProvider } from './context/LanguageContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';
import AuthLayout from './layouts/AuthLayout';
import PublicLayout from './layouts/PublicLayout';
import PageLoader from './components/common/PageLoader';
import ErrorBoundary from './components/common/ErrorBoundary';
import { DASHBOARD_PAGES } from './config/navigation';

// Lazy-loaded pages
const Landing          = lazy(() => import('./pages/public/Landing'));
const Login            = lazy(() => import('./pages/auth/Login'));
const Register         = lazy(() => import('./pages/auth/Register'));
const AdminLogin       = lazy(() => import('./pages/auth/AdminLogin'));
const AdminRegister    = lazy(() => import('./pages/auth/AdminRegister'));
const ForgotPassword   = lazy(() => import('./pages/auth/ForgotPassword'));

const Dashboard        = lazy(() => import('./pages/dashboard/Dashboard'));
const SensorMonitor    = lazy(() => import('./pages/dashboard/SensorMonitor'));
const FloodPrediction  = lazy(() => import('./pages/dashboard/FloodPrediction'));
const SOSDashboard     = lazy(() => import('./pages/dashboard/SOSDashboard'));
const ResourceTracker  = lazy(() => import('./pages/dashboard/ResourceTracker'));
const RouteMap         = lazy(() => import('./pages/dashboard/RouteMap'));
const EvacuationCenter = lazy(() => import('./pages/dashboard/EvacuationCenter'));
const VolunteerMgmt    = lazy(() => import('./pages/dashboard/VolunteerMgmt'));
const FeedbackPortal   = lazy(() => import('./pages/dashboard/FeedbackPortal'));
const Notifications    = lazy(() => import('./pages/dashboard/Notifications'));
const Reports          = lazy(() => import('./pages/dashboard/Reports'));
const Profile          = lazy(() => import('./pages/dashboard/Profile'));
const SettingsHome     = lazy(() => import('./pages/dashboard/settings/SettingsHome'));
const AccountSection   = lazy(() => import('./pages/dashboard/settings/AccountSection'));
const SecuritySection  = lazy(() => import('./pages/dashboard/settings/SecuritySection'));
const NotificationsSection = lazy(() => import('./pages/dashboard/settings/NotificationsSection'));
const AppearanceSection = lazy(() => import('./pages/dashboard/settings/AppearanceSection'));
const PrivacySection   = lazy(() => import('./pages/dashboard/settings/PrivacySection'));
const AuditSection     = lazy(() => import('./pages/dashboard/settings/AuditSection'));

// Page component for each path in config/navigation.js (which also holds its permission)
const PAGE_COMPONENTS = {
  '/dashboard':               Dashboard,
  '/dashboard/sensors':       SensorMonitor,
  '/dashboard/predictions':   FloodPrediction,
  '/dashboard/sos':           SOSDashboard,
  '/dashboard/resources':     ResourceTracker,
  '/dashboard/routes':        RouteMap,
  '/dashboard/evacuation':    EvacuationCenter,
  '/dashboard/volunteers':    VolunteerMgmt,
  '/dashboard/feedback':      FeedbackPortal,
  '/dashboard/notifications': Notifications,
  '/dashboard/reports':       Reports,
  '/dashboard/profile':       Profile,
  '/dashboard/settings':      SettingsHome,
};

const VolunteerRegister = lazy(() => import('./pages/public/VolunteerRegister'));
const PublicInfo        = lazy(() => import('./pages/public/PublicInfo'));
const NotFound          = lazy(() => import('./pages/public/NotFound'));

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
        <AuthProvider>
          <NotificationProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Toaster
                position="top-right"
                toastOptions={{
                  className: 'dark:!bg-slate-800 dark:!text-white',
                  duration: 5000,
                  style: { borderRadius: '12px', fontSize: '14px' },
                }}
              />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public */}
                  <Route element={<PublicLayout />}>
                    <Route path="/" element={<Landing />} />
                    <Route path="/public-info" element={<PublicInfo />} />
                    <Route path="/volunteer-register" element={<VolunteerRegister />} />
                  </Route>

                  {/* Auth */}
                  <Route element={<AuthLayout />}>
                    <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
                    <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
                    <Route path="/admin/login" element={<GuestRoute><AdminLogin /></GuestRoute>} />
                    <Route path="/admin/register" element={<GuestRoute><AdminRegister /></GuestRoute>} />
                    <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
                  </Route>

                  {/* Protected Dashboard */}
                  <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                    {DASHBOARD_PAGES.filter((p) => p.path !== '/dashboard/settings').map(({ path, permission }) => {
                      const Page = PAGE_COMPONENTS[path];
                      return (
                        <Route key={path} path={path}
                          element={<ProtectedRoute permission={permission}><Page /></ProtectedRoute>} />
                      );
                    })}

                    {/* Settings 2-level flow */}
                    <Route path="/dashboard/settings" element={<ProtectedRoute><SettingsHome /></ProtectedRoute>} />
                    <Route path="/dashboard/settings/account" element={<ProtectedRoute><AccountSection /></ProtectedRoute>} />
                    <Route path="/dashboard/settings/security" element={<ProtectedRoute><SecuritySection /></ProtectedRoute>} />
                    <Route path="/dashboard/settings/notifications" element={<ProtectedRoute><NotificationsSection /></ProtectedRoute>} />
                    <Route path="/dashboard/settings/appearance" element={<ProtectedRoute><AppearanceSection /></ProtectedRoute>} />
                    <Route path="/dashboard/settings/privacy" element={<ProtectedRoute><PrivacySection /></ProtectedRoute>} />
                    <Route path="/dashboard/settings/audit" element={<ProtectedRoute permission="audit.view" redirectTo="/dashboard/settings"><AuditSection /></ProtectedRoute>} />
                    <Route path="/dashboard/settings/*" element={<Navigate to="/dashboard/settings" replace />} />
                  </Route>

                  <Route path="/404" element={<NotFound />} />
                  <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </NotificationProvider>
        </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
