/** Overlays that more than one screen can open. */
let shareLiveOpen = $state(false);

export function isShareLiveOpen(): boolean {
  return shareLiveOpen;
}

export function openShareLive(): void {
  shareLiveOpen = true;
}

export function closeShareLive(): void {
  shareLiveOpen = false;
}
