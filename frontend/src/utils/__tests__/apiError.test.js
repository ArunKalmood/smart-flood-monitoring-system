import { applyFieldErrors, getErrorMessage, validationErrors } from '../apiError';

const response = (status, detail) => ({ response: { status, data: { detail } } });

describe('getErrorMessage', () => {
  test('string detail', () => {
    expect(getErrorMessage(response(401, 'Invalid email or password'))).toBe('Invalid email or password');
  });

  test('array detail (FastAPI 422) becomes "Field: message" text', () => {
    const err = response(422, [
      { type: 'value_error', loc: ['body', 'email'], msg: 'value is not a valid email address', input: 'x@example.test', ctx: {} },
      { type: 'value_error', loc: ['body', 'phone'], msg: 'Value error, Enter a valid 10-digit Indian mobile number', input: 'abc' },
    ]);
    const msg = getErrorMessage(err);
    expect(typeof msg).toBe('string');
    expect(msg).toBe('Email: value is not a valid email address · Phone: Enter a valid 10-digit Indian mobile number');
  });

  test('model-level 422 error without a field', () => {
    expect(getErrorMessage(response(422, [{ loc: ['body'], msg: 'Value error, Passwords do not match' }]))).toBe('Passwords do not match');
  });

  test('object detail', () => {
    expect(getErrorMessage(response(400, { message: 'Bad thing' }))).toBe('Bad thing');
    expect(getErrorMessage(response(400, { code: 7 }))).toBe('{"code":7}');
  });

  test('429 rate limit', () => {
    expect(getErrorMessage(response(429, 'Too many'))).toBe('Too many attempts. Please wait a minute and try again.');
  });

  test('network error and timeout', () => {
    expect(getErrorMessage({ isAxiosError: true, request: {}, message: 'Network Error' })).toBe('Cannot reach the server. Check your connection.');
    expect(getErrorMessage({ code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' })).toBe('Cannot reach the server. Check your connection.');
  });

  test('unknown shapes use the fallback and are always strings', () => {
    expect(getErrorMessage(response(500, null), 'Fallback')).toBe('Fallback');
    expect(getErrorMessage(undefined, 'Fallback')).toBe('Fallback');
    expect(getErrorMessage('plain text')).toBe('plain text');
    expect(typeof getErrorMessage({ response: { status: 418, data: {} } })).toBe('string');
  });
});

describe('field errors', () => {
  const err = response(422, [
    { loc: ['body', 'email'], msg: 'value is not a valid email address' },
    { loc: ['body', 'unknown_field'], msg: 'nope' },
  ]);

  test('validationErrors extracts field and message', () => {
    expect(validationErrors(err)).toEqual([
      { field: 'email', message: 'value is not a valid email address' },
      { field: 'unknown_field', message: 'nope' },
    ]);
  });

  test('applyFieldErrors sets react-hook-form errors only for known fields', () => {
    const setError = jest.fn();
    expect(applyFieldErrors(err, setError, ['email', 'password'])).toBe(true);
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'value is not a valid email address' });
  });
});
