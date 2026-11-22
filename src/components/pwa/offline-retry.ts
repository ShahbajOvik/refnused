/** sessionStorage key for the page that failed to load offline. */
export const OFFLINE_FROM_KEY = "offline-from";

/**
 * Inline script for the offline page. It runs before hydration, while the
 * address bar still shows the page that failed: the service worker serves
 * the offline page at that URL, and the router may then change the URL to
 * /offline.
 */
export const REMEMBER_FAILED_URL = `try{sessionStorage.setItem("${OFFLINE_FROM_KEY}",location.href)}catch(e){}`;
