/** Тонкая обёртка над Telegram.WebApp — работает и вне Telegram (dev в браузере). */

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string } };
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  switchInlineQuery?(query: string, types?: string[]): void;
  openTelegramLink?(url: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
export const inTelegram = !!tg?.initData;

/** dev-режим: без Telegram авторизуемся заголовком, id берём из ?dev или localStorage */
export function devUser(): string | null {
  if (inTelegram) return null;
  const fromUrl = new URLSearchParams(location.search).get('dev');
  if (fromUrl) {
    localStorage.setItem('hobpi_dev_user', fromUrl);
    return fromUrl;
  }
  const stored = localStorage.getItem('hobpi_dev_user');
  if (stored) return stored;
  const generated = String(Math.floor(Math.random() * 100000));
  localStorage.setItem('hobpi_dev_user', generated);
  return generated;
}

export function initTelegram(): void {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.disableVerticalSwipes?.();
  tg.setHeaderColor?.('#0e0d0c');
  tg.setBackgroundColor?.('#0e0d0c');
}

export function haptic(kind: 'tap' | 'hit' | 'win' | 'lose' | 'select' = 'tap'): void {
  const h = tg?.HapticFeedback;
  if (!h) return;
  if (kind === 'hit') h.impactOccurred('heavy');
  else if (kind === 'win') h.notificationOccurred('success');
  else if (kind === 'lose') h.notificationOccurred('error');
  else if (kind === 'select') h.selectionChanged();
  else h.impactOccurred('light');
}

/** Системная кнопка «Назад». Возвращает функцию отписки. */
export function backButton(handler: (() => void) | null): () => void {
  const b = tg?.BackButton;
  if (!b) return () => {};
  if (!handler) {
    b.hide();
    return () => {};
  }
  b.onClick(handler);
  b.show();
  return () => {
    b.offClick(handler);
    b.hide();
  };
}

/** Шаринг реплея боя в чат. */
export function shareBattle(battleId: number, text: string): void {
  if (tg?.switchInlineQuery) {
    tg.switchInlineQuery(`бой_${battleId} ${text}`, ['users', 'groups']);
    return;
  }
  const url = `${location.origin}${location.pathname}?battle=${battleId}`;
  void navigator.clipboard?.writeText(url);
}

export const defaultName = tg?.initDataUnsafe?.user?.first_name ?? 'Пацан';
