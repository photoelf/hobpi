import { useEffect, useState } from 'react';
import { FACTIONS, FACTION_IDS } from '@hobpi/engine';
import { api } from '../api.ts';
import { useGame } from '../state.tsx';
import { Panel } from '../ui/kit.tsx';

interface Row {
  place: number;
  id: number;
  name: string;
  faction: string;
  factionIcon: string;
  level: number;
  rating: number;
  wins: number;
  losses: number;
  me: boolean;
}

export function Top() {
  const { state } = useGame();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [myPlace, setMyPlace] = useState(0);

  useEffect(() => {
    void api.ladder()
      .then((r) => { setRows(r.top); setMyPlace(r.myPlace); })
      .catch(() => setRows([]));
  }, [state?.player.rating]);

  return (
    <div className="screen">
      <Panel tight>
        <div className="row spread">
          <span className="dim small">Твоё место в городе</span>
          <b className="num gold" style={{ fontSize: 18 }}>#{myPlace || '—'}</b>
        </div>
      </Panel>

      <Panel title="Хозяева города">
        {rows === null && <div className="faint small">Считаем…</div>}
        {rows?.map((r) => (
          <div className={`card${r.me ? ' on' : ''}`} key={r.id}>
            <span className="ic num" style={{ fontSize: 13 }}>
              {r.place <= 3 ? ['🥇', '🥈', '🥉'][r.place - 1] : r.place}
            </span>
            <span className="grow">
              <b className="ellipsis">{r.factionIcon} {r.name}</b>
              <div className="tiny faint num">
                ур. {r.level} · <span className="good">{r.wins}</span>/<span className="bad">{r.losses}</span>
              </div>
            </span>
            <b className="num">{r.rating}</b>
          </div>
        ))}
      </Panel>

      <Panel title="Расклад по кланам">
        <div className="stack" style={{ gap: 6 }}>
          {FACTION_IDS.map((f) => {
            const def = FACTIONS[f];
            const n = rows?.filter((r) => r.faction === f).length ?? 0;
            return (
              <div className="row spread small" key={f}>
                <span>{def.icon} {def.name}</span>
                <span className="faint num">{n} в топе</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
