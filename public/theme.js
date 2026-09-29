// Applies the saved theme before first paint. A real file instead of an inline
// script so the CSP can stay free of 'unsafe-inline'.
(function () {
  var saved = null;
  try {
    saved = localStorage.getItem('vite-ui-theme');
  } catch (e) {
    saved = null;
  }
  var mode = saved || 'system';
  var dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
})();
