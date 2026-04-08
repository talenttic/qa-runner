import { useState, useEffect } from 'react';

export interface OfflineState {
  isOnline: boolean;
  isServiceWorkerRegistered: boolean;
  lastSyncTime?: Date;
}

export const useOfflineSupport = (): OfflineState => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isServiceWorkerRegistered, setIsServiceWorkerRegistered] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>();

  useEffect(() => {
    // Register service worker
    const registerServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/'
          });

          console.log('[SW] Registered:', registration.scope);

          // Handle updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available
                  console.log('[SW] New version available');
                  // Optionally show update prompt to user
                }
              });
            }
          });

          setIsServiceWorkerRegistered(true);
        } catch (error) {
          console.error('[SW] Registration failed:', error);
        }
      }
    };

    void registerServiceWorker();

    // Listen for online/offline events
    const handleOnline = () => {
      console.log('[Offline] Back online');
      setIsOnline(true);
      setLastSyncTime(new Date());
    };

    const handleOffline = () => {
      console.log('[Offline] Gone offline');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for service worker messages
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && (event.data as any).type === 'SYNC_COMPLETE') {
        setLastSyncTime(new Date());
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, []);

  return {
    isOnline,
    isServiceWorkerRegistered,
    lastSyncTime
  };
};

// Utility to check if response came from cache
export const isCachedResponse = (response: Response): boolean => {
  return response.headers.get('sw-cache') === 'true' ||
         response.status === 503; // Our offline response
};

// Utility to trigger background sync
export const triggerBackgroundSync = async (tag: string = 'qa-sync'): Promise<void> => {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register(tag);
      console.log('[SW] Background sync registered:', tag);
    } catch (error) {
      console.error('[SW] Background sync failed:', error instanceof Error ? error.message : String(error));
    }
  }
};

// Utility to clear all caches
export const clearAllCaches = async (): Promise<void> => {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );
    console.log('[SW] All caches cleared');
  }
};