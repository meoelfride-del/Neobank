import { io } from 'socket.io-client';
import { SOCKET_BASE_URL } from '../config/runtime';

export const socket = io(SOCKET_BASE_URL, {
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
