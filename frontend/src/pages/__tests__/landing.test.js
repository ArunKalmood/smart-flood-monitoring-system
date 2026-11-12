import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '../../context/ThemeContext';
import { LanguageProvider } from '../../context/LanguageContext';
import { AuthProvider } from '../../context/AuthContext';
import Landing from '../public/Landing';
import PublicInfo from '../public/PublicInfo';
import PublicLayout from '../../layouts/PublicLayout';
import { publicAPI } from '../../services/api';
import { EMERGENCY_NUMBERS, TOP_EMERGENCY_NUMBERS } from '../../config/emergencyContacts';

jest.mock('../../services/api', () => ({
  publicAPI: {
    summary: jest.fn(),
  },
  authAPI: {
    login: jest.fn(),
    register: jest.fn(),
  },
  userAPI: {
    getProfile: jest.fn(() => new Promise(() => {})),
  },
}));

function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            {ui}
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

function renderPublicLayoutWithRoutes(initialRoute = '/') {
  return renderWithProviders(
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/public-info" element={<PublicInfo />} />
      </Route>
    </Routes>,
    { route: initialRoute }
  );
}

describe('Landing Page Hero and Autonomous Rendering (No Summary API)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Renders centered hero elements: badge, headline, supporting sentence, buttons, and sign in link', () => {
    renderWithProviders(<Landing />);

    // Small badge
    expect(screen.getByText(/IoT sensors · rule-based early warning/i)).toBeInTheDocument();

    // Benefit headline
    expect(screen.getByRole('heading', { level: 1, name: /Know about flood risk before it reaches you/i })).toBeInTheDocument();

    // Supporting sentence
    expect(screen.getByText(/Automatic flood-risk assessment from sensor readings/i)).toBeInTheDocument();

    // Two buttons: Check flood status and Call 112
    const statusBtn = screen.getByRole('link', { name: /^Check flood status$/i });
    expect(statusBtn).toBeInTheDocument();
    expect(statusBtn).toHaveAttribute('href', '/public-info');

    const call112Btns = screen.getAllByRole('link', { name: /Call 112/i });
    expect(call112Btns[0]).toHaveAttribute('href', 'tel:112');

    // Sign in / Create account link
    const signinLink = screen.getByRole('link', { name: /Sign in \/ Create account/i });
    expect(signinLink).toBeInTheDocument();
    expect(signinLink).toHaveAttribute('href', '/login');
  });

  test('Landing page renders without calling public summary or sensors API', () => {
    renderWithProviders(<Landing />);

    // Verify publicAPI.summary was never called
    expect(publicAPI.summary).not.toHaveBeenCalled();
  });
});

describe('Quick Action Tiles and Reference Link', () => {
  beforeEach(() => {
    publicAPI.summary.mockResolvedValue({
      data: {
        sensors: { total: 2, online: 2 },
        latest_reading: null,
        alerts: { active: 0, items: [] },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Tiles point to the correct public and auth routes', async () => {
    renderWithProviders(<Landing />);

    // Check flood status tile -> /public-info
    const statusTile = screen.getByRole('link', { name: /Check flood status Live water levels/i });
    expect(statusTile).toHaveAttribute('href', '/public-info');

    // Request help (SOS) tile -> /login for guest
    const sosTile = screen.getByRole('link', { name: /Request help \(SOS\) Sign in to send/i });
    expect(sosTile).toHaveAttribute('href', '/login');

    // Join as volunteer tile -> /volunteer-register
    const volTile = screen.getByRole('link', { name: /Join as volunteer Support relief/i });
    expect(volTile).toHaveAttribute('href', '/volunteer-register');

    // Slim reference link under quick actions -> /public-info
    const refLink = screen.getByRole('link', { name: /Emergency contacts, safety guidance and FAQs/i });
    expect(refLink).toHaveAttribute('href', '/public-info');
  });

  test('Mobile sticky bottom bar renders Call 112 and Sign in for unauthenticated guests', async () => {
    renderWithProviders(<Landing />);

    const stickyActions = screen.getByRole('region', { name: /Mobile Emergency Actions/i });
    expect(stickyActions).toBeInTheDocument();

    const call112InSticky = stickyActions.querySelector('a[href="tel:112"]');
    expect(call112InSticky).toBeInTheDocument();

    const signinInSticky = stickyActions.querySelector('a[href="/login"]');
    expect(signinInSticky).toBeInTheDocument();
  });
});

describe('How It Works Stepper Interactive Controls and ARIA', () => {
  beforeEach(() => {
    publicAPI.summary.mockResolvedValue({
      data: {
        sensors: { total: 2, online: 2 },
        latest_reading: null,
        alerts: { active: 0, items: [] },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Stepper has role="tablist", tabs have aria-selected/aria-controls, and supports keyboard navigation', async () => {
    renderWithProviders(<Landing />);

    const tablist = screen.getByRole('tablist', { name: /How it works/i });
    expect(tablist).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);

    // Initial state: Step 1 active
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('id', 'step-tab-0');
    expect(tabs[0]).toHaveAttribute('aria-controls', 'step-panel-0');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');

    // Panel 0 is visible with Step 1 content
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('id', 'step-panel-0');
    expect(panel).toHaveAttribute('aria-labelledby', 'step-tab-0');
    expect(screen.getByText(/River sensors continuously record water levels/i)).toBeInTheDocument();

    // Click step 2 tab
    fireEvent.click(tabs[1]);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText(/Automated rules evaluate sensor readings/i)).toBeInTheDocument();

    // Keyboard navigation with ArrowRight
    fireEvent.keyDown(tabs[1], { key: 'ArrowRight' });
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Residents receive early alerts/i)).toBeInTheDocument();

    // Keyboard navigation with Home key
    fireEvent.keyDown(tabs[2], { key: 'Home' });
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Public Layout Mobile Header and Navigation Sheet', () => {
  beforeEach(() => {
    publicAPI.summary.mockResolvedValue({
      data: {
        sensors: { total: 2, online: 2 },
        latest_reading: null,
        alerts: { active: 0, items: [] },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Mobile hamburger menu opens full-width sheet and closes on action', async () => {
    renderPublicLayoutWithRoutes('/');

    await waitFor(() => {
      expect(screen.getByText(/Know about flood risk/i)).toBeInTheDocument();
    });

    const menuButton = screen.getByRole('button', { name: /Open menu/i });
    expect(menuButton).toBeInTheDocument();
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    // Click hamburger to open
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');

    // Mobile nav sheet is now visible
    const mobileNav = document.getElementById('mobile-nav');
    expect(mobileNav).toBeInTheDocument();

    // Check links in sheet
    expect(screen.getAllByRole('link', { name: /Public info/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Volunteer/i }).length).toBeGreaterThan(0);

    // Click close button
    const closeButton = screen.getByRole('button', { name: /Close menu/i });
    fireEvent.click(closeButton);
    expect(closeButton).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Public Info Reference Page, Anchors, and About Section', () => {
  beforeEach(() => {
    publicAPI.summary.mockResolvedValue({
      data: {
        sensors: { total: 2, online: 2 },
        latest_reading: null,
        alerts: {
          active: 1,
          items: [{
            id: 'alert-1',
            title: 'River Level Advisory',
            message: 'Water rising near low-lying bridge.',
            severity: 'medium',
            created_at: new Date().toISOString(),
          }],
        },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('All stable anchors exist on the Public Info page', async () => {
    const { container } = renderWithProviders(<PublicInfo />, { route: '/public-info' });

    await waitFor(() => {
      expect(screen.getByText(/River Level Advisory/i)).toBeInTheDocument();
    });

    // Check all required anchors exist
    expect(container.querySelector('#conditions')).toBeInTheDocument();
    expect(container.querySelector('#emergency-contacts')).toBeInTheDocument();
    expect(container.querySelector('#safety')).toBeInTheDocument();
    expect(container.querySelector('#faq')).toBeInTheDocument();
    expect(container.querySelector('#about')).toBeInTheDocument();
    expect(container.querySelector('#resources')).toBeInTheDocument();
  });

  test('Emergency contact tiles match shared constant and have tel: links', async () => {
    renderWithProviders(<PublicInfo />, { route: '/public-info' });

    // Check that all emergency numbers from shared constant render as tel: links
    EMERGENCY_NUMBERS.forEach((item) => {
      const link = screen.getByRole('link', { name: new RegExp(item.number, 'i') });
      expect(link).toHaveAttribute('href', `tel:${item.number}`);
    });
  });

  test('About section displays product description, 3-step summary, honest project line, and 6 languages', async () => {
    renderWithProviders(<PublicInfo />, { route: '/public-info' });

    expect(screen.getByRole('heading', { name: /About FloodMonitor/i })).toBeInTheDocument();
    expect(screen.getByText(/FloodMonitor provides automated flood-risk monitoring from river telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/Station sensors continuously measure water levels and rainfall/i)).toBeInTheDocument();
    expect(screen.getByText(/Available in six languages: English, हिंदी, मराठी, తెలుగు, தமிழ், and ಕನ್ನಡ/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Built as an engineering project for flood monitoring/i).length).toBeGreaterThan(0);
  });

  test('FAQ accordion on Public Info opens and closes on click and keyboard', async () => {
    renderWithProviders(<PublicInfo />, { route: '/public-info' });

    const faqButtons = screen.getAllByRole('button', { expanded: false });
    expect(faqButtons.length).toBeGreaterThan(0);

    const firstFaq = faqButtons[0];
    expect(firstFaq).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    fireEvent.click(firstFaq);
    expect(firstFaq).toHaveAttribute('aria-expanded', 'true');

    // Click to close
    fireEvent.click(firstFaq);
    expect(firstFaq).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Rebuilt Public Footer Quality & Legal Standards', () => {
  beforeEach(() => {
    publicAPI.summary.mockResolvedValue({
      data: {
        sensors: { total: 2, online: 2 },
        latest_reading: null,
        alerts: { active: 0, items: [] },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Footer renders 4 semantic navigation columns, shared top emergency numbers, and dynamic year', async () => {
    renderPublicLayoutWithRoutes('/');

    // Check semantic navigation landmarks
    expect(screen.getByRole('navigation', { name: /Product navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /Emergency contacts/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /Safety resources/i })).toBeInTheDocument();

    // Check top emergency numbers from shared constant (112, 1078)
    TOP_EMERGENCY_NUMBERS.forEach((item) => {
      const links = screen.getAllByRole('link', { name: new RegExp(item.number, 'i') });
      expect(links.some((l) => l.getAttribute('href') === `tel:${item.number}`)).toBe(true);
    });

    // Deep link to all emergency contacts
    expect(screen.getByRole('link', { name: /All emergency contacts/i })).toHaveAttribute(
      'href',
      '/public-info#emergency-contacts'
    );

    // Dynamic current year in copyright
    const currentYear = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(`© ${currentYear} FloodMonitor`))).toBeInTheDocument();

    // Non-alarming emergency note
    expect(screen.getByText(/In an emergency, call 112\./i)).toBeInTheDocument();

    // Back to top button
    expect(screen.getByRole('button', { name: /Back to top/i })).toBeInTheDocument();
  });

  test('Strict Legal Rule: Privacy Policy and Terms links are ABSENT when no routes exist (no dead links)', async () => {
    renderPublicLayoutWithRoutes('/');

    expect(screen.queryByRole('link', { name: /Privacy Policy/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Terms/i })).not.toBeInTheDocument();
  });

  test('Optional Contact link is absent when REACT_APP_SUPPORT_EMAIL is not set', async () => {
    renderPublicLayoutWithRoutes('/');

    expect(screen.queryByRole('link', { name: /Contact Support/i })).not.toBeInTheDocument();
  });
});
