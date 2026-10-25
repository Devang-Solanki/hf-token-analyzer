import { useEffect, useState } from 'react';

/**
 * Theme state, shared by every page. The attribute is resolved before paint by
 * an inline script in each HTML entry; this only keeps React in step with it.
 */
export function useTheme() {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document === 'undefined' ||
      document.documentElement.getAttribute('data-theme') !== 'light'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch {
      /* storage can be unavailable; the attribute is what matters */
    }
  }, [isDark]);

  return { isDark, setIsDark };
}
