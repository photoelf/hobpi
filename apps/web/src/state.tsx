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
  suggestedName: string;
  setState: (s: GameState) => void;
  refresh: () => Promise<void>;
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
  const [toast, setToast] = useState<Toast | null>(null);

  const say = useCallback((text: string, ok = false) => {
    setToast({ text, ok });
    haptic(ok ? 'win' : 'lose');
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 3200);
  }, []);

  const refresh = useCallback(async () => {
    const me = await api.me();
    setRegistered(me.registered);
    if (me.suggestedName) setSuggestedName(me.suggestedName);
    if (me.state) setState(me.state);
  }, []);

  useEffect(() => {
    refresh()
      .catch((e) => say(e instanceof ApiError ? e.message : 'Сервер недоступен'))
      .finally(() => setLoading(false));
  }, [refresh, say]);

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
      state, loading, registered, suggestedName,
      setState: (s) => { setState(s); setRegistered(true); },
      refresh, run, toast, say,
    }),
    [state, loading, registered, suggestedName, refresh, run, toast, say],
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
