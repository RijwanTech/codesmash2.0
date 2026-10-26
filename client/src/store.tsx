import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { API_BASE, ApiError, api, getToken, setToken, setUnauthorizedHandler } from './api';
import type { ActivityItem, AppNotification, User } from './types';

export type ToastType = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  type: ToastType;
  title?: string;
  message: string;
}

interface RegisterForm {
  name: string;
  rollNo: string;
  email: string;
  year: string;
  password: string;
}

interface AppCtx {
  user: User | null;
  ready: boolean;
  /** True while the saved login could not be checked because the server is unreachable (we keep retrying, we do NOT log out). */
  serverDown: boolean;
  /** Online registration is open (false once the organiser closes it or the deadline passes). */
  registrationOpen: boolean;
  isAdmin: boolean;
  isStudent: boolean;
  /** Live-connection indicator (WebSocket). */
  connected: boolean;
  /** 'checking' | 'ok' | 'down' (not reachable) | 'old' (an outdated server answers on the port). */
  server: 'checking' | 'ok' | 'down' | 'old';
  recheckServer: () => void;
  /** Increases every time the server says "data changed" so pages can refresh themselves. */
  version: number;

  toasts: Toast[];
  notify: (type: ToastType, message: string, opts?: { title?: string; ms?: number }) => void;
  dismissToast: (id: number) => void;

  notifications: AppNotification[];
  unread: number;
  markRead: (ids?: string[]) => Promise<void>;
  activity: ActivityItem[];

  login: (rollNo: string, password: string) => Promise<string | null>;
  register: (form: RegisterForm) => Promise<string | null>;
  adminLogin: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be used inside AppProvider');
  return c;
}

interface AuthResponse {
  token: string;
  user: User;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [ready, setReady] = useState(!getToken());
  const [serverDown, setServerDown] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState(0);
  const [server, setServer] = useState<'checking' | 'ok' | 'down' | 'old'>('checking');
  const [healthTick, setHealthTick] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((type: ToastType, message: string, opts?: { title?: string; ms?: number }) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, type, message, title: opts?.title }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.ms ?? 4000);
  }, []);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const dismissToast = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const applyAuth = (res: AuthResponse) => {
    setToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
  };

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    setNotifications([]);
    setActivity([]);
  }, []);

  // Restore the session after a refresh. We only log out when the server says the login is invalid (401).
  // If the server is just unreachable or restarting, keep the login and retry – never throw the user out.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      api<{ user: User }>('/auth/me')
        .then((r) => {
          if (cancelled) return;
          setUser(r.user);
          setServerDown(false);
          setReady(true);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          if (e instanceof ApiError && e.status === 401) {
            logout();
            setServerDown(false);
            setReady(true);
          } else {
            setServerDown(true);
            timer = setTimeout(check, 3000);
          }
        });
    };
    check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [logout]);

  // Is the right server running? (Most "I get logged out" problems are a server that is down or an old copy on the port.)
  useEffect(() => {
    let alive = true;
    const check = () =>
      api<{ apiVersion?: number }>('/health')
        .then((h) => alive && setServer((h.apiVersion ?? 0) >= 3 ? 'ok' : 'old'))
        .catch((e: unknown) => alive && setServer(e instanceof ApiError && e.status !== 0 ? 'old' : 'down'));
    void check();
    const t = setInterval(() => void check(), 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [healthTick]);

  // Show "Register" only while online registration is open.
  useEffect(() => {
    api<{ open: boolean }>('/public/registration')
      .then((r) => setRegistrationOpen(r.open))
      .catch(() => {});
  }, [version]);

  // If the server says our token is no longer valid, log out cleanly.
  useEffect(() => {
    let validating = false;
    setUnauthorizedHandler((requestToken) => {
      if (validating || getToken() !== requestToken) return;
      validating = true;
      api<{ user: User }>('/auth/me')
        .then(({ user: currentUser }) => {
          if (getToken() === requestToken) setUser(currentUser);
        })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 401 && getToken() === requestToken) {
            logout();
            notifyRef.current('error', 'Your session expired. Please log in again.');
          }
        })
        .finally(() => {
          validating = false;
        });
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const loadNotifications = useCallback(async () => {
    try {
      const r = await api<{ items: AppNotification[]; unread: number }>('/notifications');
      setNotifications(r.items);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'student') void loadNotifications();
  }, [user, loadNotifications]);

  // One live WebSocket connection (re-created when the person logs in or out).
  useEffect(() => {
    const opts = { auth: { token }, transports: ['websocket', 'polling'] };
    const socket = API_BASE ? io(API_BASE, opts) : io(opts);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('data:changed', () => setVersion((v) => v + 1));
    socket.on('notification', (n: AppNotification) => {
      setNotifications((prev) => [n, ...prev.filter((x) => x.id !== n.id)]);
      notifyRef.current(n.type === 'not_qualified' ? 'info' : 'success', n.message, { title: n.title, ms: 9000 });
    });
    socket.on('activity', (a: ActivityItem) => setActivity((prev) => [a, ...prev].slice(0, 40)));
    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, [token]);

  const markRead: AppCtx['markRead'] = async (ids) => {
    setNotifications((prev) => prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)));
    try {
      await api('/notifications/read', { body: { ids } });
    } catch {
      /* ignore */
    }
  };

  const wrapAuth = async (path: string, body: unknown): Promise<string | null> => {
    try {
      applyAuth(await api<AuthResponse>(path, { body }));
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  const value: AppCtx = {
    user,
    ready,
    serverDown,
    registrationOpen,
    isAdmin: user?.role === 'admin',
    isStudent: user?.role === 'student',
    connected,
    server,
    recheckServer: () => setHealthTick((t) => t + 1),
    version,
    toasts,
    notify,
    dismissToast,
    notifications,
    unread: notifications.filter((n) => !n.read).length,
    markRead,
    activity,
    login: (rollNo, password) => wrapAuth('/auth/login', { rollNo, password }),
    register: (form) => wrapAuth('/auth/register', form),
    adminLogin: (username, password) => wrapAuth('/auth/admin-login', { username, password }),
    logout,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
