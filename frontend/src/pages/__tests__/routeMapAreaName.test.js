import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RouteMap from '../dashboard/RouteMap';
import { LanguageProvider } from '../../context/LanguageContext';
import { clearAreaCache } from '../../utils/reverseGeocode';

// Mock react-leaflet components
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children, position }) => (
    <div data-testid="map-marker" data-lat={position?.[0]} data-lng={position?.[1]}>
      {children}
    </div>
  ),
  Popup: ({ children }) => <div data-testid="map-popup">{children}</div>,
  Circle: ({ children }) => <div data-testid="map-circle">{children}</div>,
  Polyline: ({ children }) => <div data-testid="map-polyline">{children}</div>,
  ZoomControl: () => null,
  useMap: () => ({
    setView: jest.fn(),
    fitBounds: jest.fn(),
    invalidateSize: jest.fn(),
    flyTo: jest.fn(),
    getContainer: jest.fn(),
  }),
}));

// Mock leaflet icon creation
jest.mock('leaflet', () => ({
  divIcon: jest.fn(() => ({})),
}));

// Mock backend APIs with stable return implementations
jest.mock('../../services/api', () => ({
  alertAPI: { getAll: jest.fn(() => Promise.resolve({ data: [] })) },
  evacuationAPI: { getMapData: jest.fn(() => Promise.resolve({ data: [] })) },
  sensorAPI: { getAll: jest.fn(() => Promise.resolve({ data: [] })) },
  sosAPI: { getMapData: jest.fn(() => Promise.resolve({ data: [] })) },
}));

// Mock toast to keep output clean
jest.mock('../../utils/toast', () => ({
  toastError: jest.fn(),
}));

function renderRouteMap() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider>
        <RouteMap />
      </LanguageProvider>
    </MemoryRouter>
  );
}

import { alertAPI, evacuationAPI, sensorAPI, sosAPI } from '../../services/api';

describe('RouteMap - Area Name Geocoding Integration', () => {
  let geolocationMock;
  let originalFetch;

  beforeEach(() => {
    evacuationAPI.getMapData.mockResolvedValue({ data: [] });
    sosAPI.getMapData.mockResolvedValue({ data: [] });
    alertAPI.getAll.mockResolvedValue({ data: [] });
    sensorAPI.getAll.mockResolvedValue({ data: [] });
    clearAreaCache();
    geolocationMock = {
      watchPosition: jest.fn(),
      clearWatch: jest.fn(),
    };
    Object.defineProperty(navigator, 'geolocation', {
      value: geolocationMock,
      configurable: true,
      writable: true,
    });
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('displays area name and attribution when location is granted and geocoding succeeds', async () => {
    geolocationMock.watchPosition.mockImplementation((success) => {
      success({
        coords: {
          latitude: 12.8732,
          longitude: 74.8564,
          accuracy: 15,
        },
      });
      return 101;
    });

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            address: {
              suburb: 'Kadri',
              city: 'Mangaluru',
              state_district: 'Dakshina Kannada',
              state: 'Karnataka',
              country: 'India',
            },
          }),
      })
    );

    renderRouteMap();

    // Coordinates should be displayed
    expect(await screen.findByText(/12\.87320, 74\.85640/)).toBeInTheDocument();

    // Area name and OSM attribution should be visible
    const areaElements = await screen.findAllByText('Kadri, Mangaluru');
    expect(areaElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Area name provided by OpenStreetMap')).toBeInTheDocument();
  });

  test('displays locating indicator while reverse geocoding is pending', async () => {
    let resolveFetch;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    geolocationMock.watchPosition.mockImplementation((success) => {
      success({
        coords: { latitude: 12.8732, longitude: 74.8564, accuracy: 10 },
      });
      return 102;
    });

    renderRouteMap();

    // Locating text should be visible while request is pending
    expect(await screen.findByText('Finding your area…')).toBeInTheDocument();

    // Resolve fetch
    await act(async () => {
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ address: { suburb: 'Bejai', city: 'Mangaluru' } }),
      });
    });

    const bejaiElements = await screen.findAllByText('Bejai, Mangaluru');
    expect(bejaiElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Finding your area…')).not.toBeInTheDocument();
  });

  test('falls back gracefully to "Area name unavailable" while keeping coordinates if geocoding fails', async () => {
    geolocationMock.watchPosition.mockImplementation((success) => {
      success({
        coords: { latitude: 12.8732, longitude: 74.8564, accuracy: 25 },
      });
      return 103;
    });

    // Mock fetch error (e.g. network error / 503)
    global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));

    renderRouteMap();

    // Coordinates must still be rendered
    expect(await screen.findByText(/12\.87320, 74\.85640/)).toBeInTheDocument();

    // Area name unavailable note should appear
    expect(await screen.findByText('Area name unavailable')).toBeInTheDocument();
    expect(screen.getByText('Area name provided by OpenStreetMap')).toBeInTheDocument();
  });

  test('does not show area name or locating message when geolocation is denied', async () => {
    geolocationMock.watchPosition.mockImplementation((success, error) => {
      error({ code: 1, PERMISSION_DENIED: 1, message: 'User denied' });
      return 104;
    });

    global.fetch = jest.fn();

    renderRouteMap();

    // Shows standard denied message
    expect(await screen.findByText('Location permission denied.')).toBeInTheDocument();

    // Area name and locating messages must NOT be in the document
    expect(screen.queryByText('Finding your area…')).not.toBeInTheDocument();
    expect(screen.queryByText('Area name unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('Area name provided by OpenStreetMap')).not.toBeInTheDocument();

    // Fetch was never called
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('does not re-query geocoding when position changes by less than 200m', async () => {
    let watchSuccessCallback;
    geolocationMock.watchPosition.mockImplementation((success) => {
      watchSuccessCallback = success;
      success({
        coords: { latitude: 12.8732, longitude: 74.8564, accuracy: 15 },
      });
      return 105;
    });

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            address: { suburb: 'Kadri', city: 'Mangaluru' },
          }),
      })
    );

    renderRouteMap();

    await screen.findAllByText('Kadri, Mangaluru');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Minor shift (< 50 meters)
    act(() => {
      watchSuccessCallback({
        coords: { latitude: 12.8734, longitude: 74.8566, accuracy: 15 },
      });
    });

    // Should still be only 1 fetch call
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
