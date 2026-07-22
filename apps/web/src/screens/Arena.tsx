import { useEffect, useState } from 'react';
import { api, type BattleSummary, type Opponent } from '../api.ts';
import { useGame } from '../state.tsx';
import { Panel, num } from '../ui/kit.tsx';
import type { StartBattle } from '../App.tsx';

interface HistoryItem {
  id: number;
  kind: string;
  auto: boolean;
  attacked: boolean;
  won: boolean;
  draw: boolean;
  opponent?: string;
  rounds: number;
  ratingDelta?: number;
  createdAt: number;
}

export function Arena({
  onBattle, onReplay, onAutoResult,
}: {
  onBattle: StartBattle;
  onReplay: (id: number) => void;
  onAutoResult: (s: BattleSummary, battleId: number) => void;
}) {
  const { state, run, refresh } = useGame();
  const [list, setList] = useState<Opponent[] | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState(0);

  const load = () => {
    void api.opponents().then((r) => setList(r.opponents)).catch(() => setList([]));
    void api.history().then((r) => setHistory(r.battles)).catch(() => setHistory([]));
  };

  useEffect(load, [state?.player.rating]);

  if (!state) return null;
  const p = state.player;

  async function attack(o: Opponent, auto: boolean) {
    if (busy) return;
    setBusy(o.id);
    const r = await run(() => api.startBattle({ kind: 'pvp', targetId: o.id, auto }));
    setBusy(0);
    if (!r) { load(); return; }
    if (r.auto && r.summary) {
      await refresh();
      onAutoResult(r.summary, r.battleId);
      load();
    } else if (r.state) {
      onBattle(r.battleId, r.state, `Разборка: ${o.name}`);
    }
  }

  return (
    <div className="screen">
      <Panel tight>
        <div className="row spread">
          <div>
            <div className="tiny faint">рейтинг</div>
            <b className="num" style={{ fontSize: 20 }}>{p.rating}</b>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="tiny faint">победы / поражения</div>
            <b className="num"><span className="good">{p.wins}</span> / <span className="bad">{p.losses}</span></b>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="tiny faint">топливо</div>
            <b className="num">⛽ {p.fuel}/{p.fuelMax}</b>
          </div>
        </div>
      </Panel>

      <Panel title="Кто на районе" right={<button className="btn sm ghost" onClick={load}>⟳</button>}>
        {list === null && <div className="faint small">Пробиваем по своим…</div>}
        {list?.length === 0 && (
          <div className="faint small">
            Сейчас драться не с кем — все под щитом или ещё не заехали. Загляни позже.
          </div>
        )}
        {list?.map((o) => (
          <div className="card" key={o.id}>
            <span className="ic">{o.factionIcon}</span>
            <span className="grow">
              <div className="row" style={{ gap: 6 }}>
                <b className="ellipsis">{o.name}</b>
                <span className="pill">{o.rating}</span>
              </div>
              <div className="tiny faint">{o.factionName} · {o.rank} · ур. {o.level}</div>
              <div className="tiny num">
                <span className={o.relative > 1.15 ? 'bad' : o.relative < 0.85 ? 'good' : 'dim'}>
                  сила {num(o.power)}
                  {o.relative > 1.15 ? ' · сильнее тебя' : o.relative < 0.85 ? ' · слабее' : ' · ровня'}
                </span>
              </div>
            </span>
            <span className="stack" style={{ gap: 4 }}>
              <button
                className="btn sm primary"
                disabled={!!busy || p.fuel < 2}
                onClick={() => void attack(o, false)}
              >
                Наехать
              </button>
              <button
                className="btn sm"
                disabled={!!busy || p.fuel < 2}
                onClick={() => void attack(o, true)}
              >
                Автобой
              </button>
            </span>
          </div>
        ))}
      </Panel>

      <Panel title="История">
        {history.length === 0 && <div className="faint small">Пока пусто</div>}
        {history.map((h) => (
          <button className="card" key={h.id} onClick={() => onReplay(h.id)}>
            <span className="ic">{h.draw ? '🤝' : h.won ? '✅' : '❌'}</span>
            <span className="grow">
              <b className="ellipsis">
                {h.attacked ? '→ ' : '← '}
                {h.opponent ?? (h.kind === 'pve' ? 'двор' : 'соперник')}
              </b>
              <div className="tiny faint">
                {h.kind === 'pvp' ? 'разборка' : 'двор'}
                {h.auto ? ' · автобой' : ''} · {h.rounds} раундов
                {typeof h.ratingDelta === 'number' && h.kind === 'pvp' && (
                  <span className={h.ratingDelta >= 0 ? ' good' : ' bad'}>
                    {' '}· {h.ratingDelta >= 0 ? '+' : ''}{h.ratingDelta}
                  </span>
                )}
              </div>
            </span>
            <span className="tiny faint">реплей ▶</span>
          </button>
        ))}
      </Panel>
    </div>
  );
}
