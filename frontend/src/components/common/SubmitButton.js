import React from 'react';

/** Submit button that disables itself (and shows a spinner) while the request is running. */
export default function SubmitButton({ loading, loadingText, children, className = 'btn-primary w-full', disabled, ...rest }) {
  return (
    <button type="submit" disabled={loading || disabled} aria-busy={loading || undefined} className={className} {...rest}>
      {loading ? (
        <>
          <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" aria-hidden="true" />
          {loadingText}
        </>
      ) : children}
    </button>
  );
}
