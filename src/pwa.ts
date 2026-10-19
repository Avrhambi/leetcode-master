let waiting: ServiceWorker | null = null;
const listeners = new Set<(ready: boolean) => void>();

const setWaiting = (worker: ServiceWorker | null) => {
  waiting = worker;
  listeners.forEach((listener) => listener(worker !== null));
};

export function onUpdateReady(listener: (ready: boolean) => void): () => void {
  listeners.add(listener);
  listener(waiting !== null);
  return () => { listeners.delete(listener); };
}

export function applyUpdate() {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting.postMessage('SKIP_WAITING');
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((registration) => {
      const watch = (worker: ServiceWorker | null) => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
        });
      };
      if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
      registration.addEventListener('updatefound', () => watch(registration.installing));
    }).catch(() => { /* offline support is optional; the app works without it */ });
  });
}

/** Asks the browser not to evict IndexedDB. Resolves to the persisted state, or null if unsupported. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return null;
  }
}

export async function isStoragePersistent(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  } catch {
    return null;
  }
}
