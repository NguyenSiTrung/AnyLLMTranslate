/**
 * Unpatched page fetch captured at module load (before interceptor monkey-patch).
 * Max CDN subtitle segments must use the browser's native fetch/XHR path —
 * the extension background relay often returns HTTP 0 for authenticated CDN URLs.
 */
export const nativeFetch: typeof fetch = window.fetch.bind(window);