(() => {
  const bootstrapTheme = window.bootstrapData && typeof window.bootstrapData.themePreference === 'string'
    ? window.bootstrapData.themePreference
    : null;
  const storedTheme = localStorage.getItem('mediadl.themePreference');
  const candidate = bootstrapTheme || storedTheme;
  const preference = candidate === 'dark' || candidate === 'light' || candidate === 'system'
    ? candidate
    : 'system';
  const resolvedTheme = preference === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;

  document.documentElement.setAttribute('data-theme', resolvedTheme);
})();
