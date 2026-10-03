/**
 * New-version detection, framework free. The service worker updates itself
 * (registerType autoUpdate: a new build activates as soon as it is found),
 * but the page keeps running the code it loaded with. Instead of reloading
 * under the user, the rail shows an update button once the new worker is in
 * control; the click reloads. Users used to need a hard reload.
 */

export interface RegisterOptions {
  immediate?: boolean;
  /** The new worker took control; the page would normally reload here. */
  onNeedReload?: () => void;
  onRegisteredSW?: (
    swScriptUrl: string,
    registration: ServiceWorkerRegistration | undefined
  ) => void;
  onRegisterError?: (error: unknown) => void;
}

export type RegisterServiceWorker = (options: RegisterOptions) => unknown;

/** How often an open tab asks the server for a new build. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registers the worker and reports when a new version is ready. Besides the
 * browser's own check on navigation, an open tab checks on an interval and
 * each time it becomes visible again, so a tab left open for days still
 * learns about a release.
 */
export function watchForUpdates(
  register: RegisterServiceWorker,
  onAvailable: () => void,
  intervalMs = UPDATE_CHECK_INTERVAL_MS
): void {
  register({
    immediate: true,
    onNeedReload: onAvailable,
    onRegisteredSW: (_url, registration) => {
      if (!registration || typeof document === "undefined") return;
      const check = () => {
        if (document.visibilityState !== "visible") return;
        registration.update().catch(() => {
          // Offline, or the server is away: the next check tries again.
        });
      };
      setInterval(check, intervalMs);
      document.addEventListener("visibilitychange", check);
    },
    onRegisterError: (error) => {
      console.warn("[update] Service worker registration failed:", error);
    },
  });
}
