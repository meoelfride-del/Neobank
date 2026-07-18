import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
  || (import.meta.env.PROD
    ? 'https://neobank-api-meoelfride.onrender.com'
    : 'http://localhost:3001');

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket'],
  withCredentials: true,
});

function setSocketAuth() {
  const token = typeof localStorage === 'undefined'
    ? null
    : localStorage.getItem('neobank_access_token');
  socket.auth = token ? { token } : {};
}

export function getSocket() {
  return socket;
}

export function connectSocket() {
  setSocketAuth();
  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectSocket() {
  socket.removeAllListeners();
  socket.disconnect();
}

export default socket;
