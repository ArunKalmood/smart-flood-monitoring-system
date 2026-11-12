import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { setCurrentLanguage } from '../../i18n';
import { AuthProvider } from '../../context/AuthContext';
import Login from '../auth/Login';
import Register from '../auth/Register';
import AdminLogin from '../auth/AdminLogin';
import AdminRegister from '../auth/AdminRegister';
import Profile from '../dashboard/Profile';
import { authAPI, userAPI } from '../../services/api';

jest.mock('../../services/api', () => ({
  authAPI: {
    login: jest.fn(),
    register: jest.fn(),
    adminLogin: jest.fn(),
    adminRegister: jest.fn(),
    googleLogin: jest.fn(),
    changePassword: jest.fn(),
  },
  userAPI: {
    getProfile: jest.fn(() => new Promise(() => {})),
    updateProfile: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

function renderWithProviders(ui) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider>
        <AuthProvider>
          {ui}
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>
  );
}

describe('Google Sign-In Visibility and Guards', () => {
  const originalEnv = process.env.REACT_APP_GOOGLE_CLIENT_ID;

  afterEach(() => {
    process.env.REACT_APP_GOOGLE_CLIENT_ID = originalEnv;
    localStorage.clear();
    jest.clearAllMocks();
    userAPI.getProfile.mockReturnValue(new Promise(() => {}));
  });

  beforeEach(() => {
    userAPI.getProfile.mockReturnValue(new Promise(() => {}));
  });

  test('Production hides Google button and dev notice when REACT_APP_GOOGLE_CLIENT_ID is not configured', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.REACT_APP_GOOGLE_CLIENT_ID;

    renderWithProviders(<Login />);
    expect(screen.queryByTestId('google-signin-btn-container')).not.toBeInTheDocument();
    expect(screen.queryByTestId('google-signin-dev-notice')).not.toBeInTheDocument();
    expect(screen.queryByText(/By continuing, your name, email and profile picture/)).not.toBeInTheDocument();
    process.env.NODE_ENV = prevNodeEnv;
  });

  test('Development shows setup hint when REACT_APP_GOOGLE_CLIENT_ID is not configured', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    delete process.env.REACT_APP_GOOGLE_CLIENT_ID;

    renderWithProviders(<Login />);
    expect(screen.getByTestId('google-signin-dev-notice')).toBeInTheDocument();
    expect(screen.getByText(/Google sign-in is off\. Set REACT_APP_GOOGLE_CLIENT_ID in frontend\/\.env and restart npm start\./i)).toBeInTheDocument();
    expect(screen.queryByTestId('google-signin-btn-container')).not.toBeInTheDocument();
    process.env.NODE_ENV = prevNodeEnv;
  });

  test('ID set shows the button above the email field (DOM order)', () => {
    process.env.REACT_APP_GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';

    renderWithProviders(<Login />);
    const googleGroup = screen.getByRole('group', { name: /Google Sign-In/i });
    const emailInput = screen.getByLabelText(/Email/i);

    expect(googleGroup).toBeInTheDocument();
    expect(emailInput).toBeInTheDocument();
    expect(googleGroup.compareDocumentPosition(emailInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('Renders Google button container and consent text on Login when client ID is configured', () => {
    process.env.REACT_APP_GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';

    renderWithProviders(<Login />);
    expect(screen.getByTestId('google-signin-btn-container')).toBeInTheDocument();
    expect(screen.getByText(/By continuing, your name, email and profile picture are stored/)).toBeInTheDocument();
  });

  test('Renders Google button container and consent text on Register when client ID is configured', () => {
    process.env.REACT_APP_GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';

    renderWithProviders(<Register />);
    expect(screen.getByTestId('google-signin-btn-container')).toBeInTheDocument();
    expect(screen.getByText(/By continuing, your name, email and profile picture are stored/)).toBeInTheDocument();
  });

  test('Never renders Google button on AdminLogin or AdminRegister', () => {
    process.env.REACT_APP_GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';

    const { unmount } = renderWithProviders(<AdminLogin />);
    expect(screen.queryByTestId('google-signin-btn-container')).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<AdminRegister />);
    expect(screen.queryByTestId('google-signin-btn-container')).not.toBeInTheDocument();
  });
});

describe('Google Identity Services (GIS) Button Initialization and Options', () => {
  const originalEnv = process.env.REACT_APP_GOOGLE_CLIENT_ID;
  let mockInitialize;
  let mockRenderButton;
  let mockPrompt;

  beforeEach(() => {
    process.env.REACT_APP_GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
    mockInitialize = jest.fn();
    mockRenderButton = jest.fn();
    mockPrompt = jest.fn();

    window.google = {
      accounts: {
        id: {
          initialize: mockInitialize,
          renderButton: mockRenderButton,
          prompt: mockPrompt,
        },
      },
    };
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    process.env.REACT_APP_GOOGLE_CLIENT_ID = originalEnv;
    delete window.google;
    const script = document.getElementById('google-gsi-client');
    if (script) script.remove();
    document.documentElement.classList.remove('dark');
    setCurrentLanguage('en');
    jest.clearAllMocks();
  });

  test('renderButton called with expected options on Login (continue_with, rectangular, large, max 400)', () => {
    renderWithProviders(<Login />);

    expect(mockInitialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'test-google-client-id.apps.googleusercontent.com',
        auto_select: false,
      })
    );
    expect(mockPrompt).not.toHaveBeenCalled();

    expect(mockRenderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        logo_alignment: 'left',
        width: expect.any(Number),
        locale: 'en',
      })
    );

    const callArgs = mockRenderButton.mock.calls[0][1];
    expect(callArgs.width).toBeLessThanOrEqual(400);
    expect(callArgs.width).toBeGreaterThanOrEqual(200);
  });

  test('renderButton called with signup_with on Register', () => {
    renderWithProviders(<Register />);

    expect(mockRenderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'signup_with',
        logo_alignment: 'left',
        width: expect.any(Number),
      })
    );
  });

  test('Re-renders with filled_black theme when dark mode is enabled', async () => {
    renderWithProviders(<Login />);

    expect(mockRenderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ theme: 'outline' })
    );

    act(() => {
      document.documentElement.classList.add('dark');
    });

    await waitFor(() => {
      expect(mockRenderButton).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ theme: 'filled_black' })
      );
    });
  });

  test('Re-renders when language changes', async () => {
    function LoginWithLangSwitch() {
      const { setLanguage } = useLanguage();
      return (
        <div>
          <button data-testid="set-hi" onClick={() => setLanguage('hi')}>Hindi</button>
          <button data-testid="set-kn" onClick={() => setLanguage('kn')}>Kannada</button>
          <Login />
        </div>
      );
    }

    renderWithProviders(<LoginWithLangSwitch />);

    expect(mockRenderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ locale: 'en' })
    );

    const hiBtn = screen.getByTestId('set-hi');
    await userEvent.click(hiBtn);

    await waitFor(() => {
      expect(mockRenderButton).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ locale: 'hi' })
      );
    });

    const knBtn = screen.getByTestId('set-kn');
    await userEvent.click(knBtn);

    await waitFor(() => {
      expect(mockRenderButton).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ locale: 'kn' })
      );
    });
  });
});

describe('Google Script Loading States, Placeholders, and Navigation Cleanup', () => {
  const originalEnv = process.env.REACT_APP_GOOGLE_CLIENT_ID;

  beforeEach(() => {
    process.env.REACT_APP_GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
    delete window.google;
    const existing = document.getElementById('google-gsi-client');
    if (existing) existing.remove();
  });

  afterEach(() => {
    process.env.REACT_APP_GOOGLE_CLIENT_ID = originalEnv;
    delete window.google;
    const existing = document.getElementById('google-gsi-client');
    if (existing) existing.remove();
    jest.clearAllMocks();
  });

  test('Shows neutral placeholder while script loads, replaces placeholder on load', async () => {
    renderWithProviders(<Login />);

    // Script tag created
    const script = document.getElementById('google-gsi-client');
    expect(script).toBeInTheDocument();
    expect(script.src).toContain('https://accounts.google.com/gsi/client?hl=en');

    // Placeholder is visible while loading
    expect(screen.getByTestId('google-signin-placeholder')).toBeInTheDocument();

    // Mock GIS becoming available and fire script load event
    const mockInitialize = jest.fn();
    const mockRenderButton = jest.fn();
    window.google = {
      accounts: {
        id: {
          initialize: mockInitialize,
          renderButton: mockRenderButton,
        },
      },
    };

    act(() => {
      fireEvent.load(script);
    });

    // Placeholder should be gone, button rendered
    expect(screen.queryByTestId('google-signin-placeholder')).not.toBeInTheDocument();
    expect(mockRenderButton).toHaveBeenCalled();
  });

  test('Removes placeholder and shows unavailable notice on script load error without breaking email login', () => {
    renderWithProviders(<Login />);

    const script = document.getElementById('google-gsi-client');
    expect(script).toBeInTheDocument();
    expect(screen.getByTestId('google-signin-placeholder')).toBeInTheDocument();

    act(() => {
      fireEvent.error(script);
    });

    // Placeholder removed
    expect(screen.queryByTestId('google-signin-placeholder')).not.toBeInTheDocument();

    // Muted unavailable notice shown
    expect(screen.getByTestId('google-signin-error')).toBeInTheDocument();

    // Email/password form remains fully present and usable
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument();
  });

  test('Does not duplicate script tags across Login <-> Register navigation', () => {
    const { unmount } = renderWithProviders(<Login />);
    expect(document.querySelectorAll('#google-gsi-client').length).toBe(1);
    unmount();

    renderWithProviders(<Register />);
    expect(document.querySelectorAll('#google-gsi-client').length).toBe(1);
  });
});

describe('Profile Phone and Password Behavior for Google vs Local Accounts', () => {
  beforeEach(() => {
    userAPI.getProfile.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    userAPI.getProfile.mockReturnValue(new Promise(() => {}));
  });

  test('Google user: phone is optional and security tab shows managed notice', async () => {
    const googleUser = {
      id: 1,
      full_name: 'Google Citizen',
      email: 'citizen@example.com',
      phone: '',
      auth_provider: 'google',
      role: 'public_user',
      is_active: true,
      user_type: 'user',
    };
    localStorage.setItem('user', JSON.stringify(googleUser));
    localStorage.setItem('access_token', 'mock-token');

    renderWithProviders(<Profile />);

    // Phone field label should not have a required asterisk or require phone input
    const phoneInput = screen.getByLabelText(/phone/i);
    expect(phoneInput).toBeInTheDocument();
    expect(phoneInput.value).toBe('');

    // Switch to Security tab
    const securityTab = screen.getByRole('tab', { name: /security/i });
    await userEvent.click(securityTab);

    // Should display Google-managed password notice, not the update password form
    expect(screen.getByText(/Your account is linked to Google. Passwords cannot be set or changed here./i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Current password/i)).not.toBeInTheDocument();
  });

  test('Local user: phone is required and security tab shows password form', async () => {
    const localUser = {
      id: 2,
      full_name: 'Local Citizen',
      email: 'local@example.com',
      phone: '9876543210',
      auth_provider: 'local',
      role: 'public_user',
      is_active: true,
      user_type: 'user',
    };
    localStorage.setItem('user', JSON.stringify(localUser));
    localStorage.setItem('access_token', 'mock-token');

    renderWithProviders(<Profile />);

    const phoneInput = screen.getByLabelText(/phone/i);
    expect(phoneInput).toBeInTheDocument();
    expect(phoneInput.value).toBe('9876543210');

    // Switch to Security tab
    const securityTab = screen.getByRole('tab', { name: /security/i });
    await userEvent.click(securityTab);

    // Should display current password and new password fields
    expect(screen.getByLabelText(/Current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^New password/i)).toBeInTheDocument();
  });
});
