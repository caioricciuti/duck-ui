const STORAGE_KEY = "duck-ui-format-numbers";

let formatNumbers = $state(localStorage.getItem(STORAGE_KEY) !== "false");

export function getFormatNumbers(): boolean {
  return formatNumbers;
}

export function toggleFormatNumbers(): void {
  formatNumbers = !formatNumbers;
  localStorage.setItem(STORAGE_KEY, String(formatNumbers));
}
