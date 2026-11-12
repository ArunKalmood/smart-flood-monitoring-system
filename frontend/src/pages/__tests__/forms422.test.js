/**
 * Every form must survive a FastAPI 422 (detail = array of objects): no
 * "Objects are not valid as a React child" crash, and a readable message.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LanguageProvider } from '../../context/LanguageContext';
import { AuthProvider } from '../../context/AuthContext';
import Login from '../auth/Login';
import Register from '../auth/Register';
import AdminLogin from '../auth/AdminLogin';
import ForgotPassword from '../auth/ForgotPassword';
import VolunteerForm from '../../components/volunteers/VolunteerForm';
import SOSForm from '../../components/sos/SOSForm';
import { authAPI, sosAPI, volunteerAPI } from '../../services/api';

jest.mock('../../services/api', () => ({
  authAPI: { login: jest.fn(), register: jest.fn(), adminLogin: jest.fn(), forgotPassword: jest.fn() },
  userAPI: { getProfile: jest.fn(() => new Promise(() => {})) },
  sosAPI: { submit: jest.fn() },
  volunteerAPI: { register: jest.fn() },
}));

const reject422 = (field, msg) => Promise.reject({
  response: { status: 422, data: { detail: [{ type: 'value_error', loc: ['body', field], msg, input: 'x', ctx: { reason: {} } }] } },
});

function renderPage(ui) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider><AuthProvider><Toaster />{ui}</AuthProvider></LanguageProvider>
    </MemoryRouter>
  );
}

beforeEach(() => jest.clearAllMocks());

test('Login: client-side check catches x@example.test before submit', async () => {
  renderPage(<Login />);
  await userEvent.type(screen.getByLabelText('Email'), 'x@example.test');
  await userEvent.type(screen.getByLabelText('Password'), 'whatever');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument();
  expect(authAPI.login).not.toHaveBeenCalled();
});

test('Login: server 422 shows a readable message under the field', async () => {
  authAPI.login.mockImplementation(() => reject422('email', 'value is not a valid email address'));
  renderPage(<Login />);
  await userEvent.type(screen.getByLabelText('Email'), 'someone@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'whatever');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('value is not a valid email address');
  expect(await screen.findByText('Email: value is not a valid email address')).toBeInTheDocument(); // toast
});

test('Admin login: 422 is readable', async () => {
  authAPI.adminLogin.mockImplementation(() => reject422('email', 'value is not a valid email address'));
  renderPage(<AdminLogin />);
  await userEvent.type(screen.getByLabelText('Email'), 'admin@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'whatever');
  await userEvent.click(screen.getByRole('button', { name: /admin sign in/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('value is not a valid email address');
});

test('Forgot password: 422 is readable', async () => {
  authAPI.forgotPassword.mockImplementation(() => reject422('email', 'value is not a valid email address'));
  renderPage(<ForgotPassword />);
  await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
  await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('value is not a valid email address');
});

test('Register: server 422 on phone appears under the phone field', async () => {
  authAPI.register.mockImplementation(() => reject422('phone', 'Value error, Enter a valid 10-digit Indian mobile number'));
  renderPage(<Register />);
  await userEvent.type(screen.getByLabelText(/full name/i), 'Asha Rao');
  await userEvent.type(screen.getByLabelText(/^email/i), 'asha@example.com');
  await userEvent.type(screen.getByLabelText(/^phone/i), '9876543210');
  await userEvent.type(screen.getByLabelText(/^password/i), 'Str0ng!pass');
  await userEvent.type(screen.getByLabelText(/confirm password/i), 'Str0ng!pass');
  await userEvent.click(screen.getByRole('button', { name: /create account/i }));
  await waitFor(() => expect(authAPI.register).toHaveBeenCalled());
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid 10-digit Indian mobile number');
});

test('SOS: invalid phone is blocked client-side; server 422 is readable', async () => {
  renderPage(<SOSForm onSubmitted={jest.fn()} />);
  await userEvent.type(screen.getByLabelText(/full name/i), 'Asha Rao');
  await userEvent.type(screen.getByLabelText(/^phone/i), 'abc');
  await userEvent.selectOptions(screen.getByLabelText(/emergency type/i), 'flood');
  await userEvent.click(screen.getByRole('button', { name: /send sos/i }));
  expect(await screen.findByText(/valid 10-digit Indian mobile/, { selector: '[role=alert]' })).toBeInTheDocument();
  expect(sosAPI.submit).not.toHaveBeenCalled();

  sosAPI.submit.mockImplementation(() => reject422('latitude', 'Input should be less than or equal to 90'));
  await userEvent.clear(screen.getByLabelText(/^phone/i));
  await userEvent.type(screen.getByLabelText(/^phone/i), '9876543210');
  await userEvent.click(screen.getByRole('button', { name: /send sos/i }));
  await waitFor(() => expect(sosAPI.submit).toHaveBeenCalled());
  expect(await screen.findByText('Input should be less than or equal to 90', { selector: '[role=alert]' })).toBeInTheDocument();
});

test('Volunteer form: 422 is readable', async () => {
  volunteerAPI.register.mockImplementation(() => reject422('email', 'value is not a valid email address'));
  renderPage(<VolunteerForm submitLabel="Register" onSubmitted={jest.fn()} />);
  await userEvent.type(screen.getByLabelText(/full name/i), 'Ravi K');
  await userEvent.type(screen.getByLabelText(/^email/i), 'ravi@example.com');
  await userEvent.type(screen.getByLabelText(/^phone/i), '9876543210');
  await userEvent.click(screen.getByRole('button', { name: 'Register' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('value is not a valid email address');
});
