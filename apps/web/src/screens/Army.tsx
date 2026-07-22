import { useState } from 'react';
import { RECRUIT_BUILDINGS, UNITS, unitPower, unitsOfFaction } from '@hobpi/engine';
import type { FactionId, UnitDef } from '@hobpi/engine';
import { api } from '../api.ts';
import { useGame } from '../state.tsx';
import { CostView, Panel, Sheet, num } from '../ui/kit.tsx';

const TRAIT_RU: Record<string, string> = {
  SHOOTER: 'стрелок',
  FLYER: 'проезд',
  NO_RETALIATION: 'без ответки',
  DOUBLE_STRIKE: 'двойной удар',
  TAUNT: 'провокация',
  AURA_MORALE: 'аура морали',
  AURA_LUCK: 'аура удачи',
  HEAL: 'лечит',
  RESURRECT: 'поднимает павших',
  SLOW_ON_HIT: 'замедляет',
  ARMOR_BREAK: 'ломает броню',
  SHIELD_NEIGHBORS: 'прикрывает',
  DEBUFF_ATTACK: '−атака цели',
  DEBUFF_DEFENSE: '−защита цели',
  SPLASH_NEIGHBORS: 'задевает соседей',
  BLINK: 'рывок',
  STUN_ONCE: 'глушит',
  LUCKY: 'фартовый',
  MELEE_NO_PENALTY: 'бьёт в упор',
};

function UnitLine({ u }: { u: UnitDef }) {
  return (
    <div className="tiny faint num">
      ⚔{u.attack} 🛡{u.defense} 💥{u.minDmg}–{u.maxDmg} ❤{u.hp} 👟{u.speed}
      {u.shots > 0 && ` 🎯${u.shots}`}
      {u.traits.length > 0 && (
        <span className="dim"> · {u.traits.map((t) => TRAIT_RU[t] ?? t).join(', ')}</span>
      )}
    </div>
  );
}

export function Army() {
  const { state, run } = useGame();
  const [hire, setHire] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  if (!state) return null;

  const { army, pool, player, buildings } = state;
  const roster = unitsOfFaction(player.faction as FactionId);
  const have: Record<string, number> = {
    nal: player.nal, tovar: player.tovar, influence: player.influence, svyazi: player.svyazi,
  };
  const hiring = hire ? UNITS[hire] : null;
  const available = hire ? (pool[hire] ?? 0) : 0;
  const discount = player.heroClass === 'major' ? 0.8 : 1;
  const cost = hiring
    ? Object.fromEntries(
        Object.entries(hiring.cost).map(([k, v]) => [k, Math.ceil((v as number) * qty * discount)]),
      )
    : {};

  const maxAffordable = (u: UnitDef): number => {
    let n = Math.floor(pool[u.id] ?? 0);
    for (const [k, v] of Object.entries(u.cost)) {
      if (!v) continue;
      n = Math.min(n, Math.floor((have[k] ?? 0) / Math.ceil((v as number) * discount)));
    }
    return Math.max(0, n);
  };

  return (
    <div className="screen">
      <Panel title={`Бригада · ${army.length}/7`} right={<span className="tiny gold num">{num(player.power)}</span>}>
        {army.length === 0 && <div className="faint small">Бригада пуста. Найми людей ниже.</div>}
        {army.map((a, i) => {
          const u = UNITS[a.unitId];
          if (!u) return null;
          return (
            <div className="card" key={a.slot}>
              <span className="ic">{u.icon}</span>
              <span className="grow">
                <b>{u.name}</b> <span className="gold num">×{a.count}</span>
                <UnitLine u={u} />
              </span>
              <span className="stack" style={{ gap: 4 }}>
                <button
                  className="btn sm"
                  disabled={i === 0}
                  title="Выше в расстановке"
                  onClick={() => {
                    const order = army.map((x) => x.slot);
                    [order[i - 1], order[i]] = [order[i], order[i - 1]];
                    void run(() => api.arrange(order));
                  }}
                >
                  ↑
                </button>
                <button
                  className="btn sm danger"
                  title="Распустить"
                  onClick={() => void run(() => api.dismiss(a.slot), 'Распустил')}
                >
                  ✕
                </button>
              </span>
            </div>
          );
        })}
      </Panel>

      <Panel title="Найм" right={<span className="tiny faint">прирост копится раз в сутки</span>}>
        {roster.map((u) => {
          const b = RECRUIT_BUILDINGS.find((x) => x.tier === u.tier)!;
          const unlocked = !!buildings[b.key];
          const inPool = Math.floor(pool[u.id] ?? 0);
          return (
            <div className={`card${unlocked ? '' : ' '}`} key={u.id} style={{ opacity: unlocked ? 1 : 0.5 }}>
              <span className="ic">{u.icon}</span>
              <span className="grow">
                <div className="row" style={{ gap: 6 }}>
                  <b>{u.name}</b>
                  <span className="pill">T{u.tier}</span>
                  {unlocked && <span className="tiny gold num">свободно {inPool}</span>}
                </div>
                <UnitLine u={u} />
                <div className="tiny faint num" style={{ marginTop: 2 }}>
                  сила {num(unitPower(u))} · прирост {u.growth}/нед
                </div>
              </span>
              {unlocked ? (
                <button
                  className="btn sm"
                  disabled={inPool < 1}
                  onClick={() => { setHire(u.id); setQty(Math.max(1, maxAffordable(u))); }}
                >
                  <div>Нанять</div>
                  <CostView cost={u.cost} have={have} />
                </button>
              ) : (
                <span className="pill">🔒 {b.name}</span>
              )}
            </div>
          );
        })}
      </Panel>

      {hiring && (
        <Sheet title={`Найм: ${hiring.name}`} onClose={() => setHire(null)}>
          <div className="row" style={{ gap: 10, marginBottom: 12 }}>
            <span className="ic" style={{ fontSize: 30 }}>{hiring.icon}</span>
            <span className="grow">
              <UnitLine u={hiring} />
              <div className="tiny faint" style={{ marginTop: 4 }}>{hiring.desc}</div>
            </span>
          </div>

          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <button className="btn sm" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <input
              className="input grow num"
              style={{ textAlign: 'center' }}
              type="number"
              value={qty}
              min={1}
              max={Math.floor(available)}
              onChange={(e) => setQty(Math.max(1, Math.min(Math.floor(available), +e.target.value || 1)))}
            />
            <button
              className="btn sm"
              onClick={() => setQty(Math.min(Math.floor(available), qty + 1))}
            >
              +
            </button>
            <button className="btn sm" onClick={() => setQty(Math.max(1, maxAffordable(hiring)))}>
              Макс
            </button>
          </div>

          <div className="row spread small" style={{ marginBottom: 10 }}>
            <span className="dim">Итого</span>
            <CostView cost={cost} have={have} />
          </div>

          <button
            className="btn primary block"
            disabled={qty < 1 || qty > available}
            onClick={async () => {
              const r = await run(() => api.recruit(hiring.id, qty), `Нанял ${qty} × ${hiring.name}`);
              if (r) setHire(null);
            }}
          >
            Нанять {qty}
          </button>
        </Sheet>
      )}
    </div>
  );
}
