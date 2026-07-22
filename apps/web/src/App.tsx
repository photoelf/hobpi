import { useEffect, useState } from 'react';
import { ARTIFACTS, UNITS } from '@hobpi/engine';
import type { BattleState } from '@hobpi/engine';
import { api, type BattleSummary, type ReplayData } from './api.ts';
import { useGame } from './state.tsx';
import { backButton } from './tg.ts';
import { Onboarding } from './screens/Onboarding.tsx';
import { Base } from './screens/Base.tsx';
import { Army } from './screens/Army.tsx';
import { District } from './screens/District.tsx';
import { Arena } from './screens/Arena.tsx';
import { Top } from './screens/Top.tsx';
import { Hero } from './screens/Hero.tsx';
import { BattleScreen } from './battle/BattleScreen.tsx';
import { ReplayScreen } from './battle/Replay.tsx';
import { Panel, RES_ICON, ResourceBar, Sheet, num } from './ui/kit.tsx';

export type StartBattle = (battleId: number, state: BattleState, title: string) => void;

type Tab = 'base' | 'army' | 'district' | 'arena' | 'top';

const TABS: Array<{ id: Tab; icon: string; label: string }> = [
  { id: 'base', icon: '🏚️', label: 'База' },
  { id: 'army', icon: '👥', label: 'Бригада' },
  { id: 'district', icon: '🗺️', label: 'Район' },
  { id: 'arena', icon: '⚔️', label: 'Арена' },
  { id: 'top', icon: '🏆', label: 'Топ' },
];

interface ActiveBattle {
  battleId: number;
  state: BattleState;
  title: string;
}

export function App() {
  const { loading, registered, toast, state, refresh } = useGame();
  const [tab, setTab] = useState<Tab>('base');
  const [heroOpen, setHeroOpen] = useState(false);
  const [battle, setBattle] = useState<ActiveBattle | null>(null);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [result, setResult] = useState<{ summary: BattleSummary; battleId?: number } | null>(null);

  // если игрок вышел из мини-аппа посреди боя — возвращаем его в тот же бой
  useEffect(() => {
    if (!registered || battle) return;
    void api.currentBattle().then((r) => {
      if (r.active && r.state && r.battleId) {
        setBattle({
          battleId: r.battleId,
          state: r.state,
          title: (r.meta?.campName as string) ?? (r.meta?.defenderName as string) ?? 'Незаконченный бой',
        });
      }
    }).catch(() => {});
  }, [registered, battle]);

  useEffect(() => {
    if (battle || replayData) return;
    return backButton(heroOpen ? () => setHeroOpen(false) : null);
  }, [heroOpen, battle, replayData]);

  if (loading) {
    return <div className="center dim">Заводим мерина…</div>;
  }

  if (!registered) {
    return (
      <div className="app">
        <Onboarding />
        {toast && <div className={`toast${toast.ok ? ' ok' : ''}`}>{toast.text}</div>}
      </div>
    );
  }

  const startBattle: StartBattle = (battleId, s, title) => setBattle({ battleId, state: s, title });

  const openReplay = (id: number) => {
    void api.replay(id).then(setReplayData).catch(() => {});
  };

  if (battle) {
    return (
      <BattleScreen
        battleId={battle.battleId}
        initial={battle.state}
        title={battle.title}
        onFinish={(summary) => {
          setBattle(null);
          void refresh();
          if (summary) setResult({ summary });
        }}
      />
    );
  }

  if (replayData) {
    return <ReplayScreen data={replayData} onClose={() => setReplayData(null)} />;
  }

  return (
    <div className="app">
      <div className="topbar">
        <ResourceBar />
      </div>

      <div className="screen" style={{ padding: 0 }}>
        {tab === 'base' && <Base />}
        {tab === 'army' && <Army />}
        {tab === 'district' && <District onBattle={startBattle} />}
        {tab === 'arena' && (
          <Arena
            onBattle={startBattle}
            onReplay={openReplay}
            onAutoResult={(summary, battleId) => setResult({ summary, battleId })}
          />
        )}
        {tab === 'top' && <Top />}
      </div>

      <div className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
            onDoubleClick={() => t.id === 'base' && setHeroOpen(true)}
          >
            <i>{t.icon}</i>
            {t.label}
          </button>
        ))}
      </div>

      {/* герой открывается кнопкой на базе */}
      {tab === 'base' && !heroOpen && (
        <button
          className="btn sm"
          style={{ position: 'fixed', right: 12, top: 52, zIndex: 25 }}
          onClick={() => setHeroOpen(true)}
        >
          {state?.player.name ? '🎩 Герой' : 'Герой'}
        </button>
      )}

      {heroOpen && (
        <div className="backdrop" onClick={() => setHeroOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row spread" style={{ marginBottom: 6 }}>
              <h1>Герой</h1>
              <button className="btn ghost sm" onClick={() => setHeroOpen(false)}>✕</button>
            </div>
            <Hero />
          </div>
        </div>
      )}

      {result && (
        <ResultSheet
          summary={result.summary}
          battleId={result.battleId}
          onReplay={result.battleId ? () => { const id = result.battleId!; setResult(null); openReplay(id); } : undefined}
          onClose={() => setResult(null)}
        />
      )}

      {toast && <div className={`toast${toast.ok ? ' ok' : ''}`}>{toast.text}</div>}
    </div>
  );
}

function ResultSheet({
  summary, onClose, onReplay,
}: {
  summary: BattleSummary;
  battleId?: number;
  onClose: () => void;
  onReplay?: () => void;
}) {
  const won = summary.winner === 'A';
  const title = summary.winner === null ? 'Разошлись' : won ? 'Район твой' : 'Не срослось';
  const losses = summary.losses.filter((l) => l.before > l.after);

  return (
    <Sheet title={title} onClose={onClose}>
      <div style={{ fontSize: 42, textAlign: 'center', marginBottom: 6 }}>
        {summary.winner === null ? '🤝' : won ? '👑' : '💀'}
      </div>
      <div className="dim small" style={{ textAlign: 'center', marginBottom: 12 }}>
        {summary.campName ?? summary.defenderName ?? 'Разборка'} · {summary.rounds} раундов
      </div>

      {won && summary.reward && (
        <Panel title="Взяли">
          <div className="row wrap num" style={{ gap: 12 }}>
            <span>{RES_ICON.nal} <b className="gold">+{num(summary.reward.nal)}</b></span>
            {summary.reward.tovar > 0 && <span>{RES_ICON.tovar} <b>+{summary.reward.tovar}</b></span>}
            {summary.reward.influence > 0 && (
              <span>{RES_ICON.influence} <b>+{summary.reward.influence}</b></span>
            )}
            <span>✨ <b>+{summary.reward.xp}</b></span>
          </div>
          {summary.artifact && ARTIFACTS[summary.artifact] && (
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              <span style={{ fontSize: 20 }}>{ARTIFACTS[summary.artifact].icon}</span>
              <span className="small">
                Подобрал: <b className="gold">{ARTIFACTS[summary.artifact].name}</b>
              </span>
            </div>
          )}
        </Panel>
      )}

      {summary.kind === 'pvp' && (
        <Panel title="Итог разборки">
          <div className="row wrap num" style={{ gap: 12 }}>
            {typeof summary.ratingDelta === 'number' && (
              <span>
                рейтинг{' '}
                <b className={summary.ratingDelta >= 0 ? 'good' : 'bad'}>
                  {summary.ratingDelta >= 0 ? '+' : ''}{summary.ratingDelta}
                </b>
              </span>
            )}
            {typeof summary.loot === 'number' && summary.loot > 0 && (
              <span>{RES_ICON.nal} <b className="gold">+{num(summary.loot)}</b></span>
            )}
            {typeof summary.xp === 'number' && summary.xp > 0 && <span>✨ <b>+{summary.xp}</b></span>}
          </div>
        </Panel>
      )}

      {summary.levelsGained ? (
        <div className="panel tight gold small">🎉 Новый уровень! (+{summary.levelsGained})</div>
      ) : null}

      <Panel title="Потери">
        {losses.length === 0 ? (
          <div className="good small">Все живы — редкая удача</div>
        ) : (
          losses.map((l) => (
            <div className="row spread small" key={l.unitId}>
              <span>{UNITS[l.unitId]?.icon} {UNITS[l.unitId]?.name}</span>
              <span className="num bad">−{l.before - l.after}</span>
            </div>
          ))
        )}
        {summary.rescued ? (
          <div className="tiny faint" style={{ marginTop: 6 }}>
            Бригада полегла — район подкинул {summary.rescued} пацанов, чтобы было с чем начать.
          </div>
        ) : null}
      </Panel>

      <div className="row" style={{ gap: 8 }}>
        {onReplay && <button className="btn grow" onClick={onReplay}>▶ Реплей</button>}
        <button className="btn primary grow" onClick={onClose}>Дальше</button>
      </div>
    </Sheet>
  );
}
