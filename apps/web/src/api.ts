import { devUser, inTelegram, tg } from './tg.ts';
import type { Action, BattleSetup, BattleState } from '@hobpi/engine';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

/**
 * Куда стучаться за API.
 * Пусто — значит тот же origin (dev через прокси Vite, либо API раздаёт статику сам).
 * На GitHub Pages статика и API живут на разных доменах, поэтому адрес зашивается
 * при сборке: VITE_API_URL=https://api.example.com npm run build
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (inTelegram && tg?.initData) h.authorization = `tma ${tg.initData}`;
  else {
    const d = devUser();
    if (d) h['x-dev-user'] = d;
  }
  return h;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(data.error ?? `Ошибка ${res.status}`, res.status);
  return data as T;
}

export const get = <T,>(path: string) => request<T>('GET', path);
export const post = <T,>(path: string, body?: unknown) => request<T>('POST', path, body);

/* ── Типы ответов ────────────────────────────────────────────────── */

export interface PlayerView {
  id: number;
  name: string;
  faction: string;
  factionName: string;
  heroClass: string;
  heroClassName: string;
  level: number;
  xp: number;
  xpCurrent: number;
  xpNext: number;
  rank: string;
  stats: {
    attack: number; defense: number; power: number; knowledge: number;
    morale: number; luck: number; speedBonus: number;
  };
  nal: number;
  influence: number;
  svyazi: number;
  tovar: number;
  vaultCap: number;
  fuel: number;
  fuelMax: number;
  rating: number;
  wins: number;
  losses: number;
  power: number;
}

export interface GameState {
  player: PlayerView;
  buildings: Record<string, number>;
  spots: Array<{ key: string; level: number }>;
  spotSlots: number;
  army: Array<{ slot: number; unitId: string; count: number }>;
  pool: Record<string, number>;
  artifacts: Array<{ id: number; artId: string; equipped: boolean }>;
  incomePerTick: Record<string, number>;
  nextIncomeIn: number;
  weekly: { key: string; name: string; desc: string; icon: string };
  roster: string[];
}

export interface Camp {
  id: string;
  name: string;
  faction: string;
  difficulty: 'easy' | 'normal' | 'hard';
  power: number;
  army: Array<{ unitId: string; count: number }>;
  reward: { nal: number; tovar: number; influence: number; xp: number };
}

export interface Opponent {
  id: number;
  name: string;
  faction: string;
  factionName: string;
  factionIcon: string;
  level: number;
  rating: number;
  rank: string;
  power: number;
  relative: number;
}

export interface BattleSummary {
  kind: string;
  auto: boolean;
  winner: 'A' | 'B' | null;
  rounds: number;
  rescued?: number;
  campName?: string;
  defenderName?: string;
  attackerName?: string;
  reward?: { nal: number; tovar: number; influence: number; xp: number };
  artifact?: string | null;
  levelsGained?: number;
  loot?: number;
  xp?: number;
  ratingDelta?: number;
  losses: Array<{ unitId: string; before: number; after: number }>;
}

export interface StartResponse {
  auto: boolean;
  battleId: number;
  setup?: BattleSetup;
  state?: BattleState;
  summary?: BattleSummary;
  playerState?: GameState;
}

export interface ActResponse {
  state: BattleState;
  finished: boolean;
  summary?: BattleSummary;
  battleId?: number;
  playerState?: GameState;
}

export interface ReplayData {
  id: number;
  kind: string;
  auto: boolean;
  setup: BattleSetup;
  actions: Action[];
  aiSides: Array<'A' | 'B'>;
  result: string;
  summary: BattleSummary;
  createdAt: number;
  viewerSide: 'A' | 'B';
}

/* ── Методы ──────────────────────────────────────────────────────── */

export const api = {
  me: () => get<{ registered: boolean; suggestedName?: string; state?: GameState }>('/api/me'),
  start: (faction: string, heroClass: string, name: string) =>
    post<{ ok: true; state: GameState }>('/api/auth/start', { faction, heroClass, name }),
  state: () => get<GameState>('/api/state'),

  build: (key: string) => post<GameState>('/api/city/build', { key }),
  buildSpot: (key: string) => post<GameState>('/api/city/spot', { key }),
  upgradeSpot: (key: string) => post<GameState>('/api/city/spot/upgrade', { key }),
  recruit: (unitId: string, count: number) =>
    post<GameState>('/api/army/recruit', { unitId, count }),
  dismiss: (slot: number, count?: number) => post<GameState>('/api/army/dismiss', { slot, count }),
  toPool: (slot: number, count: number) => post<GameState>('/api/army/toPool', { slot, count }),
  arrange: (order: number[]) => post<GameState>('/api/army/arrange', { order }),
  equip: (artifactId: number) => post<GameState>('/api/hero/equip', { artifactId }),
  unequip: (artifactId: number) => post<GameState>('/api/hero/unequip', { artifactId }),

  camps: () => get<{ epoch: number; camps: Camp[] }>('/api/pve/camps'),
  opponents: () => get<{ opponents: Opponent[]; myPower: number }>('/api/arena/opponents'),
  ladder: () =>
    get<{ top: Array<{ place: number; id: number; name: string; faction: string; factionIcon: string; level: number; rating: number; wins: number; losses: number; me: boolean }>; myPlace: number }>(
      '/api/ladder',
    ),
  history: () =>
    get<{ battles: Array<{ id: number; kind: string; auto: boolean; attacked: boolean; won: boolean; draw: boolean; opponent?: string; rounds: number; ratingDelta?: number; createdAt: number }> }>(
      '/api/history',
    ),

  currentBattle: () =>
    get<{ active: boolean; battleId?: number; state?: BattleState; setup?: BattleSetup; meta?: Record<string, unknown> }>(
      '/api/battle/current',
    ),
  startBattle: (body: { kind: 'pve' | 'pvp'; difficulty?: string; targetId?: number; auto?: boolean }) =>
    post<StartResponse>('/api/battle/start', body),
  act: (battleId: number, action: Action) =>
    post<ActResponse>('/api/battle/act', { battleId, action }),
  retreat: (battleId: number) =>
    post<{ retreated: boolean; playerState: GameState }>('/api/battle/retreat', { battleId }),
  replay: (id: number) => get<ReplayData>(`/api/battle/${id}`),
};
