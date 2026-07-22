import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, ExternalLink, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { getSocket } from '../services/socket';

const KIND_STYLES = {
  info: 'bg-blue-500/10 text-blue-300',
  success: 'bg-mint-500/10 text-mint-400',
  warning: 'bg-gold-500/10 text-gold-400',
  security: 'bg-coral-500/10 text-coral-400',
};

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const unreadCount = useMemo(() => notifications.filter((item) => !item.read_at).length, [notifications]);

  async function loadNotifications() {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
    const socket = getSocket();
    const receiveNotification = (notification) => {
      setNotifications((items) => [notification, ...items.filter((item) => item.id !== notification.id)]);
    };
    socket.on('admin:notification', receiveNotification);
    return () => socket.off('admin:notification', receiveNotification);
  }, []);

  async function openNotification(notification) {
    if (!notification.read_at) {
      await api.patch(`/notifications/${notification.id}/read`);
      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
    }
    if (notification.action_url) {
      setOpen(false);
      navigate(notification.action_url);
    }
  }

  async function markAllRead() {
    await api.patch('/notifications/read-all');
    const readAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at || readAt })));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative w-10 h-10 grid place-items-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-250/70 hover:text-white transition-colors"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} non lues` : ''}`}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-coral-500 text-white text-[10px] font-bold grid place-items-center border-2 border-ink-900">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[4.6rem] sm:top-auto sm:mt-2 sm:w-[24rem] panel z-50 overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div><p className="text-sm font-semibold text-white">Notifications</p><p className="text-[11px] text-slate-250/40">{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</p></div>
            {unreadCount > 0 && <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] text-mint-400 hover:underline"><CheckCheck size={13} />Tout marquer comme lu</button>}
          </div>

          <div className="max-h-[65vh] sm:max-h-96 overflow-y-auto divide-y divide-white/5">
            {loading ? (
              <div className="py-10 grid place-items-center text-slate-250/40"><Loader2 size={20} className="animate-spin" /></div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center"><Bell size={24} className="mx-auto text-slate-250/20 mb-2" /><p className="text-xs text-slate-250/40">Aucun message pour le moment.</p></div>
            ) : notifications.map((notification) => (
              <button key={notification.id} onClick={() => openNotification(notification)} className={`w-full text-left px-4 py-3 hover:bg-white/[0.035] transition-colors ${notification.read_at ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${KIND_STYLES[notification.kind] || KIND_STYLES.info}`}><Bell size={14} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold text-white">{notification.title}</p>{!notification.read_at && <span className="w-2 h-2 rounded-full bg-mint-400 shrink-0 mt-1" />}</div>
                    <p className="text-xs text-slate-250/60 mt-1 leading-relaxed break-words">{notification.message}</p>
                    <div className="flex items-center justify-between gap-2 mt-2"><span className="text-[10px] text-slate-250/30">{new Date(notification.created_at).toLocaleString('fr-FR')}</span>{notification.action_url && <span className="flex items-center gap-1 text-[10px] text-mint-400">Ouvrir <ExternalLink size={10} /></span>}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
