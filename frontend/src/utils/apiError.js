/**
 * The one place that turns an API/network error into a user-facing string.
 * Never returns anything but a string, so it is always safe to render or toast.
 */
import { translate } from '../i18n';

const humanize = (field) => field.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function fieldLabel(loc) {
  const field = Array.isArray(loc) ? loc.filter((part) => part !== 'body' && typeof part === 'string').pop() : null;
  if (!field) return null;
  const key = `field_${field}`;
  const label = translate(key);
  return label === key ? humanize(field) : label;
}

const cleanMessage = (msg) => String(msg ?? '').replace(/^Value error, /, '');

/** Pydantic 422 `detail` array → [{ field, message }] (field is null for whole-form errors). */
export function validationErrors(error) {
  const detail = error?.response?.data?.detail;
  if (!Array.isArray(detail)) return [];
  return detail.map((item) => {
    const loc = Array.isArray(item?.loc) ? item.loc.filter((p) => p !== 'body') : [];
    return { field: typeof loc[loc.length - 1] === 'string' ? loc[loc.length - 1] : null, message: cleanMessage(item?.msg) };
  });
}

export function getErrorMessage(error, fallback) {
  const fallbackText = fallback || translate('error_generic');
  if (error === null || error === undefined) return fallbackText;
  if (typeof error === 'string') return error;

  const status = error.response?.status;
  if (status === 429) return translate('error_rate_limited');
  if (!error.response) {
    if (error.code === 'ECONNABORTED' || error.request || error.isAxiosError) return translate('error_network');
    return typeof error.message === 'string' && error.message ? error.message : fallbackText;
  }

  const detail = error.response.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((item) => {
        const label = fieldLabel(item?.loc);
        const msg = cleanMessage(item?.msg);
        return label ? `${label}: ${msg}` : msg;
      })
      .join(' · ');
  }
  if (detail && typeof detail === 'object') {
    return typeof detail.message === 'string' ? detail.message : JSON.stringify(detail);
  }
  return fallbackText;
}

/**
 * Put 422 field errors under the matching react-hook-form inputs.
 * Returns true if at least one error was attached to a field.
 */
export function applyFieldErrors(error, setError, fieldNames) {
  let applied = false;
  validationErrors(error).forEach(({ field, message }) => {
    if (field && (!fieldNames || fieldNames.includes(field))) {
      setError(field, { type: 'server', message });
      applied = true;
    }
  });
  return applied;
}
