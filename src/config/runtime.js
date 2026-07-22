const hostname = typeof window === 'undefined' ? '' : window.location.hostname;
const isLocalBrowser = hostname === 'localhost' || hostname === '127.0.0.1';

function safePublicUrl(value) {
  if (!value) return null;
  const targetsLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(value);
  return !isLocalBrowser && targetsLocalhost ? null : value.replace(/\/$/, '');
}

export const API_BASE_URL = safePublicUrl(import.meta.env.VITE_API_URL)
  || (isLocalBrowser
    ? 'http://localhost:4000/api'
    : 'https://neobank-api-meoelfride.onrender.com/api');

export const SOCKET_BASE_URL = safePublicUrl(import.meta.env.VITE_SOCKET_URL)
  || (isLocalBrowser
    ? 'http://localhost:4000'
    : 'https://neobank-api-meoelfride.onrender.com');

export const API_ROOT_URL = API_BASE_URL.replace(/\/api\/?$/, '');
