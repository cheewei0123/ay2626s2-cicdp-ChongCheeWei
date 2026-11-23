import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

// The bits of Google Identity Services (accounts.google.com/gsi/client) we use
type GoogleId = {
  initialize: (options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
  }) => void;
  renderButton: (parent: HTMLElement, options: object) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT = 'https://accounts.google.com/gsi/client';
let loading: Promise<void> | undefined;

// Google's script is only loaded when the server has Google sign-in set up, and once
function loadScript() {
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google did not load'));
    document.head.append(script);
  }).catch((err: Error) => {
    loading = undefined; // a failed load is tried again next time
    throw err;
  });
  return loading;
}

// "Continue with Google" (KAN-95). Google draws its own button (its rules for how it
// looks); a click gives an ID token, which onCredential sends to the API. Nothing is
// shown when the server has no GOOGLE_CLIENT_ID, or when Google can't be reached.
export function GoogleButton({
  onCredential,
}: {
  onCredential: (credential: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  // The newest handler, without drawing the button again when it changes
  const handler = useRef(onCredential);
  useEffect(() => {
    handler.current = onCredential;
  });

  useEffect(() => {
    let stop = false;
    api<{ clientId: string | null }>('/auth/google')
      .then(async ({ clientId }) => {
        if (!clientId) return;
        await loadScript();
        const id = window.google?.accounts.id;
        if (stop || !id || !box.current) return;
        id.initialize({
          client_id: clientId,
          callback: ({ credential }) => handler.current(credential),
        });
        id.renderButton(box.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: Math.min(box.current.offsetWidth || 320, 400),
        });
        setReady(true);
      })
      .catch(() => undefined); // no Google: the email way still works
    return () => {
      stop = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {ready && (
        <p className="flex items-center gap-3 text-sm text-muted">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </p>
      )}
      {/* Google draws into this; it stays empty (and takes no space) until then */}
      <div ref={box} className="flex justify-center" />
    </div>
  );
}
