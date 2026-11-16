import { useEffect } from 'react';

// Runs `load` now and then every `ms`, so two phones see each other's changes
// within a few seconds. It stops when the page is left.
export function usePolling(load: () => unknown, ms = 5000) {
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), ms);
    return () => clearInterval(timer);
  }, [load, ms]);
}
