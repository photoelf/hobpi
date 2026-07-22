import { useState } from 'react';
import {
  RECRUIT_BUILDINGS, SPECIAL_BUILDINGS, SPOTS, spotIncomeMultiplier,
} from '@hobpi/engine';
import type { Cost } from '@hobpi/engine';
import { api } from '../api.ts';
import { useGame } from '../state.tsx';
import { CostView, Panel, RES_ICON, Sheet, num } from '../ui/kit.tsx';

export function Base() {
  const { state, run } = useGame();
  const [sheet, setSheet] = useState<'spots' | null>(null);
  if (!state) return null;

  const { player, buildings, spots, spotSlots, incomePerTick, weekly } = state;
  const have: Record<string, number> = {
    nal: player.nal, tovar: player.tovar, influence: player.influence, svyazi: player.svyazi,
  };

  const incomeParts = Object.entries(incomePerTick).filter(([, v]) => v > 0);

  return (
    <div className="screen">
      <Panel tight>
        <div className="row spread">
          <div className="grow">
            <div className="row" style={{ gap: 6 }}>
              <b>{player.name}</b>
              <span className="pill">{player.rank}</span>
            </div>
            <div className="tiny faint" style={{ marginTop: 2 }}>
              {player.factionName} · {player.heroClassName} · ур. {player.level}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="tiny faint">сила бригады</div>
            <b className="num gold">{num(player.power)}</b>
          </div>
        </div>
      </Panel>

      <Panel tight>
        <div className="row spread tiny">
          <span>
            <span className="gold">{weekly.icon} {weekly.name}</span>
            <span className="faint"> · {weekly.desc}</span>
          </span>
        </div>
      </Panel>

      <Panel title="Доход" right={<span className="tiny faint">за 6 часов</span>}>
        <div className="row wrap num" style={{ gap: 10 }}>
          {incomeParts.length
            ? incomeParts.map(([k, v]) => (
                <span key={k}>{RES_ICON[k]} <b>+{num(v)}</b></span>
              ))
            : <span className="faint small">Точек нет — дохода нет</span>}
        </div>
        <div className="tiny faint" style={{ marginTop: 6 }}>
          Касса: {num(player.nal)} / {num(player.vaultCap)}
          {player.nal >= player.vaultCap && <span className="bad"> · переполнена, забирай</span>}
        </div>
      </Panel>

      <Panel
        title={`Точки · ${spots.length}/${spotSlots}`}
        right={
          <button
            className="btn sm"
            disabled={spots.length >= spotSlots}
            onClick={() => setSheet('spots')}
          >
            + Крышевать
          </button>
        }
      >
        {spots.length === 0 && <div className="faint small">Пока ничего не крышуешь</div>}
        {spots.map((s) => {
          const def = SPOTS.find((d) => d.key === s.key)!;
          const m = spotIncomeMultiplier(s.level);
          const upCost: Cost = {};
          for (const [k, v] of Object.entries(def.buildCost)) {
            upCost[k as keyof Cost] = Math.round((v as number) * Math.pow(2.5, s.level));
          }
          return (
            <div className="card" key={s.key}>
              <span className="ic">{def.icon}</span>
              <span className="grow">
                <b>{def.name}</b> <span className="faint tiny">ур. {s.level}</span>
                <div className="tiny dim num">
                  {Object.entries(def.income)
                    .map(([k, v]) => `${RES_ICON[k]} ${Math.floor((v as number) * m)}`)
                    .join('  ')}
                </div>
              </span>
              {s.level < 3 && (
                <button
                  className="btn sm"
                  onClick={() => void run(() => api.upgradeSpot(s.key), 'Точка прокачана')}
                >
                  <div>↑</div>
                  <CostView cost={upCost} have={have} />
                </button>
              )}
            </div>
          );
        })}
      </Panel>

      <Panel title="Здания найма">
        {RECRUIT_BUILDINGS.map((b) => {
          const built = !!buildings[b.key];
          const prev = RECRUIT_BUILDINGS.find((x) => x.tier === b.tier - 1);
          const locked = !!prev && !buildings[prev.key];
          return (
            <div className={`card${built ? ' on' : ''}`} key={b.key}>
              <span className="ic">{b.icon}</span>
              <span className="grow">
                <b>{b.name}</b> <span className="faint tiny">тир {b.tier}</span>
                <div className="tiny faint">{b.desc}</div>
              </span>
              {built ? (
                <span className="pill">есть</span>
              ) : (
                <button
                  className="btn sm"
                  disabled={locked}
                  onClick={() => void run(() => api.build(b.key), `${b.name} построен`)}
                >
                  <div>{locked ? '🔒' : 'Строить'}</div>
                  {!locked && <CostView cost={b.cost} have={have} />}
                </button>
              )}
            </div>
          );
        })}
      </Panel>

      <Panel title="Хозяйство">
        {SPECIAL_BUILDINGS.map((b) => {
          const lvl = buildings[b.key] ?? 0;
          const maxed = lvl >= b.maxLevel;
          const cost = maxed ? {} : b.cost(lvl + 1);
          return (
            <div className={`card${lvl ? ' on' : ''}`} key={b.key}>
              <span className="ic">{b.icon}</span>
              <span className="grow">
                <b>{b.name}</b>
                {b.maxLevel > 1 && <span className="faint tiny"> {lvl}/{b.maxLevel}</span>}
                <div className="tiny faint">{b.desc}</div>
              </span>
              {maxed ? (
                <span className="pill">макс</span>
              ) : (
                <button
                  className="btn sm"
                  onClick={() => void run(() => api.build(b.key), `${b.name}: готово`)}
                >
                  <div>{lvl ? '↑' : 'Строить'}</div>
                  <CostView cost={cost} have={have} />
                </button>
              )}
            </div>
          );
        })}
      </Panel>

      {sheet === 'spots' && (
        <Sheet title="Что будем крышевать" onClose={() => setSheet(null)}>
          {SPOTS.map((d) => {
            const owned = spots.some((s) => s.key === d.key);
            return (
              <div className="card" key={d.key}>
                <span className="ic">{d.icon}</span>
                <span className="grow">
                  <b>{d.name}</b>
                  <div className="tiny faint">{d.desc}</div>
                  <div className="tiny dim num">
                    {Object.entries(d.income).map(([k, v]) => `${RES_ICON[k]} ${v}`).join('  ')} / 6 ч
                  </div>
                </span>
                <button
                  className="btn sm"
                  disabled={owned}
                  onClick={async () => {
                    const r = await run(() => api.buildSpot(d.key), `${d.name} под крышей`);
                    if (r) setSheet(null);
                  }}
                >
                  <div>{owned ? 'есть' : 'Взять'}</div>
                  {!owned && <CostView cost={d.buildCost} have={have} />}
                </button>
              </div>
            );
          })}
        </Sheet>
      )}
    </div>
  );
}
