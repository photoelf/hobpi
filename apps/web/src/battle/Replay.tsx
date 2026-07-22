import { useEffect, useMemo, useRef, useState } from 'react';
import { UNITS, createBattle, replay } from '@hobpi/engine';
import type { BattleEvent } from '@hobpi/engine';
import type { ReplayData } from '../api.ts';
import { backButton, shareBattle } from '../tg.ts';
import { Field, type FieldStack } from './Field.tsx';
import { describeEvent } from './events.ts';

/** Позиции и численность стеков восстанавливаются проигрыванием лога по шагам. */
function project(
  base: FieldStack[],
  log: BattleEvent[],
  upTo: number,
): { stacks: FieldStack[]; hit: Set<number> } {
  const stacks = base.map((s) => ({ ...s }));
  const hit = new Set<number>();
  for (let i = 0; i < upTo && i < log.length; i++) {
    const ev = log[i];
    if (ev.t === 'move') {
      const s = stacks.find((x) => x.id === ev.stackId);
      if (s) { s.x = ev.tx; s.y = ev.ty; }
    } else if (ev.t === 'attack') {
      const s = stacks.find((x) => x.id === ev.targetId);
      if (s) s.count = Math.max(0, s.count - ev.kills);
      if (i === upTo - 1) hit.add(ev.targetId);
    } else if (ev.t === 'heal') {
      const s = stacks.find((x) => x.id === ev.targetId);
      if (s) s.count += ev.revived;
    } else if (ev.t === 'death') {
      const s = stacks.find((x) => x.id === ev.stackId);
      if (s) s.count = 0;
    }
  }
  return { stacks, hit };
}

export function ReplayScreen({ data, onClose }: { data: ReplayData; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => backButton(onClose), [onClose]);

  const { final, base } = useMemo(() => {
    const start = createBattle(data.setup);
    const baseStacks: FieldStack[] = start.stacks.map((s) => ({
      id: s.id, unitId: s.unitId, side: s.side, x: s.x, y: s.y, count: s.count,
    }));
    return { final: replay(data.setup, data.actions, data.aiSides), base: baseStacks };
  }, [data]);

  const log = final.log;

  useEffect(() => {
    if (!playing || step >= log.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), 420);
    return () => clearTimeout(t);
  }, [playing, step, log.length]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [step]);

  const { stacks, hit } = project(base, log, step);
  const lines = log.slice(0, step).map((e) => describeEvent(final, e)).filter(Boolean) as string[];
  const round = log.slice(0, step).reduce((r, e) => (e.t === 'round' ? e.n : r), 1);
  const done = step >= log.length;

  const you = data.viewerSide;
  const youWon = data.result === you;
  const title = data.kind === 'pvp'
    ? `${data.summary.attackerName ?? 'Ты'} → ${data.summary.defenderName ?? 'соперник'}`
    : (data.summary.campName ?? 'Разборка');

  return (
    <div className="battle">
      <div className="battle-top">
        <b className="grow ellipsis">{title}</b>
        <span className="faint tiny">раунд {round}</span>
        <span className="tiny">{done ? (youWon ? '✅' : '❌') : '▶'}</span>
      </div>

      <Field
        width={final.width}
        height={final.height}
        stacks={stacks}
        hitIds={hit}
      />

      <div className="hint" ref={feedRef} style={{ maxHeight: 76, overflowY: 'auto' }}>
        {lines.slice(-5).map((l, i) => <div key={`${l}-${i}`}>{l}</div>)}
      </div>

      <div className="actions">
        <button className="btn" onClick={() => setStep(0)}>⟲ Сначала</button>
        <button className="btn" onClick={() => setPlaying(!playing)} disabled={done}>
          {playing ? '❚❚ Пауза' : '▶ Дальше'}
        </button>
        <button className="btn" onClick={() => setStep(log.length)}>⏭ В конец</button>
        <button
          className="btn"
          onClick={() => shareBattle(data.id, `${UNITS[data.setup.A.army[0]?.unitId]?.name ?? ''}`)}
        >
          ↗ В чат
        </button>
        <button className="btn danger" onClick={onClose}>✕</button>
      </div>
    </div>
  );
}
