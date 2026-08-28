import { useCallback, useEffect, useState } from 'react';

const DISMISS_KEY = 'sautiledger-pwa-dismiss';

function isStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [standalone, setStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneMode());
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');

    const onPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const onInstalled = () => setDeferredPrompt(null);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    window.localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }, []);

  return {
    standalone,
    canInstall: Boolean(deferredPrompt) && !standalone && !dismissed,
    showIosTip: isIos && !standalone && !dismissed,
    install,
    dismiss,
  };
}
