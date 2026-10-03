import { watchForUpdates } from "@/lib/appUpdate";

let available = $state(false);
let applying = $state(false);

/** A newer build is active in the service worker; a reload picks it up. */
export const isUpdateAvailable = (): boolean => available;
export const isUpdateApplying = (): boolean => applying;

/** Registers the service worker and starts watching for new builds. */
export async function startUpdateChecks(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const { registerSW } = await import("virtual:pwa-register");
  watchForUpdates(registerSW, () => {
    available = true;
  });
}

/** Stores pending work, then reloads into the new version without the leave prompt. */
export async function applyUpdate(): Promise<void> {
  if (applying) return;
  applying = true;
  const { flushAutoSave, leaveWithoutPrompt } = await import("@/store");
  leaveWithoutPrompt();
  try {
    await flushAutoSave();
  } catch {
    // The reload goes ahead; the workspace reopens as it was last stored.
  }
  window.location.reload();
}
