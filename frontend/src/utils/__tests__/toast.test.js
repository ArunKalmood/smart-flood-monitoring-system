import baseToast from 'react-hot-toast';
import toast, { toastError } from '../toast';

jest.mock('react-hot-toast', () => {
  const fn = jest.fn();
  fn.success = jest.fn();
  fn.error = jest.fn();
  fn.dismiss = jest.fn();
  return { __esModule: true, default: fn };
});

test('a 422 error object passed to toast.error becomes readable text (no React crash)', () => {
  const err = { response: { status: 422, data: { detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email address', input: 'x', ctx: {} }] } } };
  toast.error(err);
  expect(baseToast.error).toHaveBeenCalledWith('Email: value is not a valid email address', undefined);
  toastError(err);
  expect(baseToast.error).toHaveBeenLastCalledWith('Email: value is not a valid email address');
});

test('strings pass through unchanged', () => {
  toast.success('Saved');
  expect(baseToast.success).toHaveBeenCalledWith('Saved', undefined);
});
