/*
 * Sets the theme class before the first paint (no flash of the wrong theme).
 * It replaces next-themes' own script, whose text changes with the build's
 * minifier: this one is a fixed string, so the strict CSP on sensitive
 * routes can allow it by hash (THEME_SCRIPT_HASH, computed from this
 * constant in src/lib/security/csp.ts). Mirrors the ThemeProvider settings:
 * class attribute, storage key "theme", light/dark/system, colour scheme.
 */
export const THEME_INIT_SCRIPT =
  '(function(){try{var d=document.documentElement,t=localStorage.getItem("theme")||"system";if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.classList.remove("light","dark");d.classList.add(t);d.style.colorScheme=t}catch(e){}})()';
