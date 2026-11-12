/**
 * react-hot-toast, made safe: any non-string message (e.g. an API error
 * object) is converted with getErrorMessage instead of crashing React.
 * Import toast from here, never from 'react-hot-toast' directly.
 */
import { isValidElement } from 'react';
import baseToast from 'react-hot-toast';
import { getErrorMessage } from './apiError';

const safe = (message) =>
  typeof message === 'string' || typeof message === 'function' || isValidElement(message)
    ? message
    : getErrorMessage(message);

const toast = (message, options) => baseToast(safe(message), options);
toast.success = (message, options) => baseToast.success(safe(message), options);
toast.error = (message, options) => baseToast.error(safe(message), options);
toast.dismiss = baseToast.dismiss;

/** Show the readable message for an API error. */
export const toastError = (error, fallback) => baseToast.error(getErrorMessage(error, fallback));

export default toast;
