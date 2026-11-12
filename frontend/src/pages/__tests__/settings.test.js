import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '../../context/ThemeContext';
import { LanguageProvider } from '../../context/LanguageContext';
import { AuthProvider } from '../../context/AuthContext';
import { NotificationProvider } from '../../context/NotificationContext';
import DashboardLayout from '../../layouts/DashboardLayout';
import ProtectedRoute from '../../components/common/ProtectedRoute';
import SettingsHome from '../dashboard/settings/SettingsHome';
import SettingsSubPage from '../dashboard/settings/SettingsSubPage';
import AccountSection from '../dashboard/settings/AccountSection';
import SecuritySection from '../dashboard/settings/SecuritySection';
import NotificationsSection from '../dashboard/settings/NotificationsSection';
import AppearanceSection from '../dashboard/settings/AppearanceSection';
import PrivacySection from '../dashboard/settings/PrivacySection';
import AuditSection from '../dashboard/settings/AuditSection';
import ChangePasswordForm from '../../components/account/ChangePasswordForm';
import Profile from '../dashboard/Profile';
import { setCurrentLanguage } from '../../i18n';
import { authAPI, userAPI, auditAPI, dashboardAPI } from '../../services/api';

jest.mock('../../services/api', () => ({
  authAPI: {
    changePassword: jest.fn(),
  },
  userAPI: {
    getProfile: jest.fn(() => new Promise(() => {})),
    updateProfile: jest.fn(() => Promise.resolve({ data: {} })),
  },
  auditAPI: {
    getAll: jest.fn(() => Promise.resolve({ data: { total: 0, items: [] } })),
    getActions: jest.fn(() => Promise.resolve({ data: { actions: [] } })),
  },
  dashboardAPI: {
    getStats: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

// Mock scrollIntoView and scrollTo for JSDOM
window.HTMLElement.prototype.scrollIntoView = jest.fn();
window.scrollTo = jest.fn();

const mockLocalUser = {
  id: 1,
  full_name: 'Jane Citizen',
  email: 'jane@example.com',
  phone: '9876543210',
  role: 'public_user',
  user_type: 'user',
  auth_provider: 'local',
  is_active: true,
  last_login: '2026-10-14T10:00:00Z',
  notification_prefs: {
    flood_warnings: true,
    sos_updates: true,
    volunteer_updates: true,
    weather_alerts: true,
    system_messages: true,
  },
};

const mockGoogleUser = {
  id: 2,
  full_name: 'Google Citizen',
  email: 'google@example.com',
  role: 'public_user',
  user_type: 'user',
  auth_provider: 'google',
  profile_photo: 'https://lh3.googleusercontent.com/photo.jpg',
  is_active: true,
  last_login: '2026-10-15T08:00:00Z',
  notification_prefs: {
    flood_warnings: true,
    sos_updates: true,
  },
};

const mockAdminUser = {
  id: 3,
  name: 'District Admin',
  full_name: 'District Admin',
  email: 'admin@gov.in',
  role: 'district_admin',
  user_type: 'admin',
  department: 'Disaster Management',
  auth_provider: 'local',
  is_active: true,
  last_login: '2026-10-15T09:30:00Z',
};

function renderSettingsRouter({ user = mockLocalUser, route = '/dashboard/settings' } = {}) {
  if (user) {
    localStorage.setItem('access_token', 'mock_token');
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.clear();
  }

  return render(
    <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <NotificationProvider>
              <Routes>
                <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                  <Route path="/dashboard/settings" element={<ProtectedRoute><SettingsHome /></ProtectedRoute>} />
                  <Route path="/dashboard/settings/account" element={<ProtectedRoute><AccountSection /></ProtectedRoute>} />
                  <Route path="/dashboard/settings/security" element={<ProtectedRoute><SecuritySection /></ProtectedRoute>} />
                  <Route path="/dashboard/settings/notifications" element={<ProtectedRoute><NotificationsSection /></ProtectedRoute>} />
                  <Route path="/dashboard/settings/appearance" element={<ProtectedRoute><AppearanceSection /></ProtectedRoute>} />
                  <Route path="/dashboard/settings/privacy" element={<ProtectedRoute><PrivacySection /></ProtectedRoute>} />
                  <Route
                    path="/dashboard/settings/audit"
                    element={<ProtectedRoute permission="audit.view" redirectTo="/dashboard/settings"><AuditSection /></ProtectedRoute>}
                  />
                  <Route path="/dashboard/settings/*" element={<Navigate to="/dashboard/settings" replace />} />
                  <Route path="/dashboard/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                </Route>
              </Routes>
            </NotificationProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  setCurrentLanguage('en');
  userAPI.getProfile.mockReturnValue(new Promise(() => {}));
  userAPI.updateProfile.mockResolvedValue({ data: {} });
  auditAPI.getAll.mockResolvedValue({ data: { total: 0, items: [] } });
  auditAPI.getActions.mockResolvedValue({ data: { actions: [] } });
  dashboardAPI.getStats.mockResolvedValue({ data: {} });
});

afterEach(() => {
  setCurrentLanguage('en');
  localStorage.clear();
  jest.clearAllMocks();
});

describe('Settings Home (Index Page: /dashboard/settings)', () => {
  test('Renders option list, compact account card, and NO section content', () => {
    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings' });

    // Header & summary card
    expect(screen.getByRole('heading', { level: 1, name: /Settings/i })).toBeInTheDocument();
    expect(screen.getAllByText('Jane Citizen').length).toBeGreaterThan(0);
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getAllByText(/Public user/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Edit profile/i })).toHaveAttribute('href', '/dashboard/profile');

    // Group headings
    expect(screen.getByRole('heading', { level: 2, name: /^Account$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^Preferences$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^Privacy & Security$/i })).toBeInTheDocument();

    // Option cards with real links
    expect(screen.getByRole('link', { name: /Account Overview of your credentials/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/account'
    );
    expect(screen.getByRole('link', { name: /Security Update your password/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/security'
    );
    expect(screen.getByRole('link', { name: /Notifications Select which flood alerts/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/notifications'
    );
    expect(screen.getByRole('link', { name: /Appearance & Language/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/appearance'
    );
    expect(screen.getByRole('link', { name: /Privacy & Data/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/privacy'
    );

    // Audit option card is NOT rendered for citizen user
    expect(screen.queryByRole('link', { name: /Audit Log/i })).not.toBeInTheDocument();

    // NO section content rendered on home
    expect(screen.queryByLabelText(/Current password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('Emergency SOS Requests')).not.toBeInTheDocument();
  });

  test('Renders audit option card on home when user has audit.view permission', () => {
    renderSettingsRouter({ user: mockAdminUser, route: '/dashboard/settings' });

    expect(screen.getByRole('link', { name: /Audit Log/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/audit'
    );
  });

  test('Clicking an option navigates to that sub-route', async () => {
    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings' });

    const securityLink = screen.getByRole('link', { name: /Security Update your password/i });
    fireEvent.click(securityLink);

    // Navigates to security sub-page
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Security & Password/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Current password/i)).toBeInTheDocument();
    });
  });

  test('Hash deep-link redirect: /dashboard/settings#security redirects to /dashboard/settings/security', async () => {
    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings#security' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Security & Password/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Current password/i)).toBeInTheDocument();
    });
  });
});

describe('Sub-pages Routing, Guards, and Back Links', () => {
  test('Direct visit to /dashboard/settings/account renders Account sub-page with back link and title', () => {
    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/account' });

    expect(screen.getByRole('heading', { level: 1, name: /Account Information/i })).toBeInTheDocument();
    expect(document.title).toContain('Account Information');
    expect(screen.getAllByRole('link', { name: /Settings/i }).length).toBeGreaterThan(0);
  });

  test('Direct visit to /dashboard/settings/appearance renders Appearance sub-page', () => {
    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/appearance' });

    expect(screen.getByRole('heading', { level: 1, name: /Appearance & Language/i })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
  });

  test('Direct visit to /dashboard/settings/notifications renders Notifications sub-page', () => {
    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/notifications' });

    expect(screen.getByRole('heading', { level: 1, name: /Notification Preferences/i })).toBeInTheDocument();
    expect(screen.getAllByRole('switch').length).toBe(5);
  });

  test('Direct visit to /dashboard/settings/privacy renders Privacy sub-page', () => {
    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/privacy' });

    expect(screen.getByRole('heading', { level: 1, name: /Privacy & Data Handling/i })).toBeInTheDocument();
    expect(screen.getByText('Account Profile')).toBeInTheDocument();
    expect(screen.getByText('Location & Geolocation')).toBeInTheDocument();
  });

  test('Unknown sub-path redirects to /dashboard/settings', async () => {
    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/nonexistent' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Settings/i })).toBeInTheDocument();
    });
  });

  test('Unauthorized visit to /dashboard/settings/audit redirects to /dashboard/settings', async () => {
    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/audit' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Settings/i })).toBeInTheDocument();
      expect(screen.queryByText('Filter by action')).not.toBeInTheDocument();
    });
  });

  test('Authorized visit to /dashboard/settings/audit renders audit table and filters', async () => {
    auditAPI.getAll.mockResolvedValueOnce({
      data: {
        total: 1,
        items: [
          {
            id: 201,
            action: 'ADMIN_LOGIN',
            actor_email: 'admin@gov.in',
            ip_address: '10.0.0.1',
            created_at: '2026-10-15T09:00:00Z',
          },
        ],
      },
    });

    renderSettingsRouter({ user: mockAdminUser, route: '/dashboard/settings/audit' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Security Audit Log/i })).toBeInTheDocument();
      expect(screen.getAllByText('ADMIN_LOGIN').length).toBeGreaterThan(0);
      expect(screen.getAllByText('admin@gov.in').length).toBeGreaterThan(0);
    });
  });

  test('Back link returns to /dashboard/settings', async () => {
    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/account' });

    const backLinks = screen.getAllByRole('link', { name: /Settings/i });
    fireEvent.click(backLinks[0]);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Settings/i })).toBeInTheDocument();
    });
  });

  test('Breadcrumb shows Dashboard > Settings > <Option> on sub-pages', () => {
    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/security' });

    const breadcrumbNav = screen.getByRole('navigation', { name: /Breadcrumb/i });
    expect(breadcrumbNav).toHaveTextContent(/Dashboard/i);
    expect(breadcrumbNav).toHaveTextContent(/Settings/i);
    expect(breadcrumbNav).toHaveTextContent(/Security/i);
  });

  test('Sidebar Settings link remains active on sub-pages', () => {
    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/security' });

    const sidebarNav = screen.getByRole('navigation', { name: /Main navigation/i });
    const settingsLink = sidebarNav.querySelector('a[href="/dashboard/settings"]');
    expect(settingsLink).toHaveAttribute('aria-current', 'page');
  });

  test('Unsaved changes confirmation modal triggers on Back when form is dirty', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/settings/test-dirty']}>
        <LanguageProvider>
          <SettingsSubPage title="Test Dirty" isDirty={true}>
            <div>Content</div>
          </SettingsSubPage>
        </LanguageProvider>
      </MemoryRouter>
    );

    const backBtn = screen.getAllByRole('link', { name: /Settings/i })[0];
    fireEvent.click(backBtn);

    // Modal appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getAllByText(/You have unsaved changes/i).length).toBeGreaterThan(0);

    // Discard button cancels and closes
    const discardBtn = screen.getByRole('button', { name: /Discard/i });
    fireEvent.click(discardBtn);
  });
});

describe('Form & Preference Controls on Sub-pages', () => {
  test('SecuritySection: ChangePasswordForm validation and update', async () => {
    authAPI.changePassword.mockResolvedValueOnce({
      data: { message: 'Password changed successfully' },
    });

    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/security' });

    const currentInput = screen.getByLabelText(/Current password/i);
    const newInput = screen.getByLabelText(/^New password/i);
    const confirmInput = screen.getByLabelText(/^Confirm password/i);

    await userEvent.type(currentInput, 'OldPass123!');
    await userEvent.type(newInput, 'BrandNewPass123!');
    await userEvent.type(confirmInput, 'BrandNewPass123!');

    const submitBtn = screen.getByRole('button', { name: /Update password/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authAPI.changePassword).toHaveBeenCalledWith({
        current_password: 'OldPass123!',
        new_password: 'BrandNewPass123!',
      });
    });
  });

  test('SecuritySection: Google account shows managed-by-Google notice', () => {
    renderSettingsRouter({ user: mockGoogleUser, route: '/dashboard/settings/security' });

    expect(screen.getByText(/Your account is linked to Google. Passwords cannot be set or changed here./i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Current password/i)).not.toBeInTheDocument();
  });

  test('AppearanceSection: Theme change persists immediately to backend', async () => {
    userAPI.updateProfile.mockResolvedValueOnce({
      data: { ...mockLocalUser, theme: 'dark' },
    });

    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/appearance' });

    const darkThemeRadio = screen.getByRole('radio', { name: /Dark/i });
    fireEvent.click(darkThemeRadio);

    await waitFor(() => {
      expect(userAPI.updateProfile).toHaveBeenCalledWith({ theme: 'dark' });
    });
  });

  test('AppearanceSection: Language change updates context and persists', async () => {
    userAPI.updateProfile.mockResolvedValueOnce({
      data: { ...mockLocalUser, language: 'hi' },
    });

    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/appearance' });

    const hindiRadio = screen.getByRole('radio', { name: /हिंदी/i });
    fireEvent.click(hindiRadio);

    await waitFor(() => {
      expect(userAPI.updateProfile).toHaveBeenCalledWith({ language: 'hi' });
    });
  });

  test('NotificationsSection: Switches toggle and Save button is dirty-gated', async () => {
    userAPI.updateProfile.mockResolvedValueOnce({
      data: {
        ...mockLocalUser,
        notification_prefs: { ...mockLocalUser.notification_prefs, flood_warnings: false },
      },
    });

    renderSettingsRouter({ user: mockLocalUser, route: '/dashboard/settings/notifications' });

    const saveBtn = screen.getByRole('button', { name: /Save preferences/i });
    expect(saveBtn).toBeDisabled();

    const switches = screen.getAllByRole('switch');
    expect(switches[0]).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(switches[0]);
    expect(switches[0]).toHaveAttribute('aria-checked', 'false');
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(userAPI.updateProfile).toHaveBeenCalledWith({
        notification_prefs: expect.objectContaining({ flood_warnings: false }),
      });
    });
  });
});
