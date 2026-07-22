import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ABILITIES, UNITS, activeStack, legalCasts, legalMoves,
} from '@hobpi/engine';
import type { Action, BattleState } from '@hobpi/engine';
import { api, ApiError, type BattleSummary } from '../api.ts';
import { backButton, haptic } from '../tg.ts';
import { useGame } from '../state.tsx';
import { Field, type Highlight } from './Field.tsx';
import { describeEvent, hitStacks } from './events.ts';

const key = (x: number, y: number) => y * 100 + x;

export function BattleScreen({
  battleId, initial, title, onFinish,
}: {
  battleId: number;
  initial: BattleState;
  title: string;
  onFinish: (summary: BattleSummary | null) => void;
}) {
  const { say, setState } = useGame();
  const [state, setBattle] = useState<BattleState>(initial);
  const [busy, setBusy] = useState(false);
  const [castId, setCastId] = useState<string | null>(null);
  const [castOpen, setCastOpen] = useState(false);
  const [feed, setFeed] = useState<string[]>([]);
  const [hits, setHits] = useState<Set<number>>(new Set());
  const seen = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);

  // системная кнопка «Назад» = отступление
  useEffect(() => backButton(() => void retreat()), []);

  // лента событий: показываем всё, что произошло с прошлого рендера
  useEffect(() => {
    const fresh = state.log.slice(seen.current);
    seen.current = state.log.length;
    if (!fresh.length) return;
    const lines = fresh.map((e) => describeEvent(state, e)).filter(Boolean) as string[];
    if (lines.length) setFeed((f) => [...f, ...lines].slice(-40));
    const h = hitStacks(fresh);
    if (h.size) {
      setHits(h);
      haptic('hit');
      const t = setTimeout(() => setHits(new Set()), 340);
      return () => clearTimeout(t);
    }
  }, [state]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed]);

  const me = activeStack(state);
  const myTurn = !!me && me.side === 'A' && !state.finished;
  const legal = myTurn ? legalMoves(state) : null;
  const casts = state.finished ? [] : legalCasts(state, 'A');
  const hero = state.heroes.A;

  /** Подсветка клеток: куда можно шагнуть, кого можно ударить, куда нацелить приём. */
  const highlight = useMemo(() => {
    const map = new Map<number, Highlight>();
    if (castId) {
      const a = ABILITIES[castId];
      for (const s of state.stacks) {
        if (s.count <= 0) continue;
        const okAlly = (a?.target === 'ally' || a?.target === 'cell_ally') && s.side === 'A';
        const okEnemy = a?.target === 'enemy' && s.side === 'B';
        if (okAlly || okEnemy) map.set(key(s.x, s.y), 'cast');
      }
      return map;
    }
    if (!legal) return map;
    for (const c of legal.moveCells) map.set(key(c.x, c.y), 'move');
    for (const t of legal.meleeTargets) {
      const s = state.stacks.find((x) => x.id === t.targetId);
      if (s) map.set(key(s.x, s.y), 'attack');
    }
    for (const id of legal.shootTargets) {
      const s = state.stacks.find((x) => x.id === id);
      if (s) map.set(key(s.x, s.y), 'attack');
    }
    for (const id of legal.healTargets) {
      const s = state.stacks.find((x) => x.id === id);
      if (s) map.set(key(s.x, s.y), 'cast');
    }
    return map;
  }, [state, legal, castId]);

  async function send(action: Action) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.act(battleId, action);
      setBattle(res.state);
      if (res.finished) {
        if (res.playerState) setState(res.playerState);
        haptic(res.summary?.winner === 'A' ? 'win' : 'lose');
        onFinish(res.summary ?? null);
      }
    } catch (e) {
      say(e instanceof ApiError ? e.message : 'Ход не прошёл');
    } finally {
      setBusy(false);
    }
  }

  async function retreat() {
    const res = await api.retreat(battleId).catch(() => null);
    if (res?.playerState) setState(res.playerState);
    onFinish(null);
  }

  function tapCell(x: number, y: number) {
    if (busy || state.finished) return;
    const target = state.stacks.find((s) => s.x === x && s.y === y && s.count > 0);

    if (castId) {
      const a = ABILITIES[castId];
      if (a?.target === 'all_allies') {
        void send({ type: 'cast', abilityId: castId });
      } else if (target) {
        void send({ type: 'cast', abilityId: castId, targetId: target.id, x, y });
      }
      setCastId(null);
      setCastOpen(false);
      return;
    }

    if (!legal) return;

    if (target && target.side === 'B') {
      const melee = legal.meleeTargets.find((t) => t.targetId === target.id);
      if (legal.shootTargets.includes(target.id)) {
        void send({ type: 'shoot', targetId: target.id });
      } else if (melee) {
        void send({ type: 'attack', targetId: melee.targetId, x: melee.x, y: melee.y });
      } else {
        say('До него не дотянуться в этот ход');
      }
      return;
    }

    if (target && target.side === 'A' && legal.healTargets.includes(target.id)) {
      void send({ type: 'heal', targetId: target.id });
      return;
    }

    if (legal.moveCells.some((c) => c.x === x && c.y === y)) {
      void send({ type: 'move', x, y });
    }
  }

  const meUnit = me ? UNITS[me.unitId] : null;

  return (
    <div className="battle">
      <div className="battle-top">
        <b className="grow ellipsis">{title}</b>
        <span className="faint tiny">раунд {state.round}</span>
        <span className="tiny" title="связи">☎️ {hero.mana}</span>
      </div>

      <div className="queue">
        {state.queue.concat(state.waitQueue).map((id) => {
          const s = state.stacks.find((x) => x.id === id);
          if (!s || s.count <= 0) return null;
          const u = UNITS[s.unitId];
          return (
            <div key={id} className={`queue-item ${s.side}${id === state.activeId ? ' now' : ''}`}>
              <em>{u?.icon}</em>
              {s.count}
            </div>
          );
        })}
      </div>

      <Field
        width={state.width}
        height={state.height}
        stacks={state.stacks}
        activeId={state.activeId}
        highlight={highlight}
        hitIds={hits}
        onCell={tapCell}
      />

      <div className="hint" ref={feedRef} style={{ maxHeight: 62, overflowY: 'auto' }}>
        {feed.slice(-4).map((line, i) => (
          <div key={`${line}-${i}`}>{line}</div>
        ))}
      </div>

      {!castOpen ? null : (
        <div className="casts">
          {casts.map((id) => {
            const a = ABILITIES[id];
            return (
              <button
                key={id}
                className={`cast-btn${castId === id ? ' on' : ''}`}
                onClick={() => setCastId(castId === id ? null : id)}
                disabled={busy}
              >
                <em>{a?.icon}</em>
                {a?.name}
                <div className="faint">☎️{a?.cost}</div>
              </button>
            );
          })}
        </div>
      )}

      <div className="actions">
        <button
          className="btn"
          disabled={!myTurn || busy || !legal?.canWait}
          onClick={() => void send({ type: 'wait' })}
        >
          Ждать
        </button>
        <button
          className="btn"
          disabled={!myTurn || busy}
          onClick={() => void send({ type: 'defend' })}
        >
          Глухая
        </button>
        <button
          className={`btn${castOpen ? ' primary' : ''}`}
          disabled={busy || !casts.length || hero.castThisRound}
          onClick={() => { setCastOpen(!castOpen); setCastId(null); }}
        >
          Приём
        </button>
        <button className="btn danger" disabled={busy} onClick={() => void retreat()}>
          Уйти
        </button>
      </div>

      {myTurn && meUnit && (
        <div className="hint">
          Ходит <b>{meUnit.name}</b> ({me!.count}) · тапни врага чтобы ударить, зелёное — чтобы пройти
        </div>
      )}
    </div>
  );
}
