import { useEffect, useRef } from 'react';

/** Run `callback` now and every `intervalMs` while mounted; stops on unmount. */
export default function usePolling(callback, intervalMs) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    saved.current();
    if (!intervalMs) return undefined;
    const id = setInterval(() => saved.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
