import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, type GameState } from './api.ts';
import { haptic } from './tg.ts';

interface Toast {
  text: string;
  ok: boolean;
}

interface Ctx {
  state: GameState | null;
  loading: boolean;
  registered: boolean;
  /** сервер не отвечает — показываем отдельный экран, а не сломанный онбординг */
  offline: boolean;
  suggestedName: string;
  setState: (s: GameState) => void;
  refresh: () => void;
  /** Обёртка вызова API: показывает ошибку тостом и не роняет экран. */
  run: <T>(fn: () => Promise<T>, okText?: string) => Promise<T | null>;
  toast: Toast | null;
  say: (text: string, ok?: boolean) => void;
}

const GameCtx = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [registered, setRegistered] = useState(false);
  const [suggestedName, setSuggestedName] = useState('Пацан');
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const say = useCallback((text: string, ok = false) => {
    setToast({ text, ok });
    haptic(ok ? 'win' : 'lose');
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 3200);
  }, []);

  const refresh = useCallback(async () => {
    const me = await api.me();
    setOffline(false);
    setRegistered(me.registered);
    if (me.suggestedName) setSuggestedName(me.suggestedName);
    if (me.state) setState(me.state);
  }, []);

  const boot = useCallback(() => {
    setLoading(true);
    refresh()
      .catch((e) => {
        // ApiError = сервер ответил и объяснил; всё прочее = до сервера не достучались
        if (e instanceof ApiError) say(e.message);
        else setOffline(true);
      })
      .finally(() => setLoading(false));
  }, [refresh, say]);

  useEffect(boot, [boot]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okText?: string): Promise<T | null> => {
      try {
        const r = await fn();
        if (r && typeof r === 'object' && 'player' in (r as object)) {
          setState(r as unknown as GameState);
        }
        if (okText) say(okText, true);
        else haptic('tap');
        return r;
      } catch (e) {
        say(e instanceof ApiError ? e.message : 'Что-то пошло не так');
        return null;
      }
    },
    [say],
  );

  const value = useMemo<Ctx>(
    () => ({
      state, loading, registered, offline, suggestedName,
      setState: (s) => { setState(s); setRegistered(true); },
      refresh: boot, run, toast, say,
    }),
    [state, loading, registered, offline, suggestedName, boot, run, toast, say],
  );

  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}

export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error('useGame вне GameProvider');
  return c;
}

/** Состояние игрока гарантированно есть — для экранов после онбординга. */
export function usePlayer(): GameState {
  const { state } = useGame();
  if (!state) throw new Error('Нет состояния игрока');
  return state;
}
