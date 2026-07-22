import { useEffect, useState } from 'react';
import { FACTIONS, UNITS } from '@hobpi/engine';
import type { FactionId } from '@hobpi/engine';
import { api, type Camp } from '../api.ts';
import { useGame } from '../state.tsx';
import { Panel, RES_ICON, num } from '../ui/kit.tsx';
import type { StartBattle } from '../App.tsx';

const DIFF_RU = { easy: 'мелочь', normal: 'серьёзно', hard: 'опасно' } as const;

export function District({ onBattle }: { onBattle: StartBattle }) {
  const { state, run } = useGame();
  const [camps, setCamps] = useState<Camp[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.camps().then((r) => setCamps(r.camps)).catch(() => setCamps([]));
  }, [state?.player.power]);

  if (!state) return null;
  const p = state.player;

  async function go(c: Camp) {
    if (busy) return;
    setBusy(true);
    const r = await run(() => api.startBattle({ kind: 'pve', difficulty: c.difficulty }));
    setBusy(false);
    if (r?.state && r.battleId) onBattle(r.battleId, r.state, c.name);
  }

  return (
    <div className="screen">
      <Panel tight>
        <div className="row spread small">
          <span className="dim">Твоя сила</span>
          <b className="num gold">{num(p.power)}</b>
        </div>
        <div className="row spread small" style={{ marginTop: 4 }}>
          <span className="dim">Топливо</span>
          <b className="num">⛽ {p.fuel}/{p.fuelMax}</b>
        </div>
      </Panel>

      <Panel title="Дворы района" right={<span className="tiny faint">обновляются раз в 30 мин</span>}>
        {camps === null && <div className="faint small">Смотрим, кто где стоит…</div>}
        {camps?.length === 0 && <div className="faint small">Сейчас тихо. Загляни позже.</div>}
        {camps?.map((c) => {
          const rel = p.power > 0 ? c.power / p.power : 1;
          return (
            <div className="card" key={c.id}>
              <span className="ic">{FACTIONS[c.faction as FactionId]?.icon ?? '❓'}</span>
              <span className="grow">
                <div className="row" style={{ gap: 6 }}>
                  <b className="ellipsis">{c.name}</b>
                  <span className={`pill ${c.difficulty}`}>{DIFF_RU[c.difficulty]}</span>
                </div>
                <div className="tiny faint">
                  {c.army.map((a) => `${UNITS[a.unitId]?.icon ?? ''}${a.count}`).join(' ')}
                </div>
                <div className="tiny num" style={{ marginTop: 3 }}>
                  <span className={rel > 1.1 ? 'bad' : rel < 0.8 ? 'good' : 'dim'}>
                    сила {num(c.power)}
                  </span>
                  <span className="faint">
                    {'  '}· {RES_ICON.nal} {num(c.reward.nal)}
                    {c.reward.tovar > 0 && `  ${RES_ICON.tovar} ${c.reward.tovar}`}
                    {c.reward.influence > 0 && `  ${RES_ICON.influence} ${c.reward.influence}`}
                    {'  '}✨ {c.reward.xp}
                  </span>
                </div>
              </span>
              <button
                className="btn sm primary"
                disabled={busy || p.fuel < 1 || state.army.length === 0}
                onClick={() => void go(c)}
              >
                Заехать
                <div className="tiny">⛽1</div>
              </button>
            </div>
          );
        })}
      </Panel>

      <Panel title="Как это работает">
        <div className="small dim stack" style={{ gap: 6 }}>
          <div>· Победа даёт налик, товар и опыт. Иногда с людей падает вещь.</div>
          <div>· Потери в бою настоящие — павших придётся нанимать заново.</div>
          <div>· Отступить можно в любой момент: бригада цела, но топливо сгорит.</div>
        </div>
      </Panel>
    </div>
  );
}
