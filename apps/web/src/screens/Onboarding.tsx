import { useState } from 'react';
import { FACTIONS, FACTION_IDS, HERO_CLASSES, MVP_CLASSES, unitsOfFaction } from '@hobpi/engine';
import type { FactionId } from '@hobpi/engine';
import { api } from '../api.ts';
import { useGame } from '../state.tsx';
import { haptic } from '../tg.ts';

export function Onboarding() {
  const { suggestedName, setState, run } = useGame();
  const [step, setStep] = useState(0);
  const [faction, setFaction] = useState<FactionId | null>(null);
  const [heroClass, setHeroClass] = useState<string | null>(null);
  const [name, setName] = useState(suggestedName);
  const [busy, setBusy] = useState(false);

  async function finish() {
    if (!faction || !heroClass) return;
    setBusy(true);
    const r = await run(() => api.start(faction, heroClass, name || suggestedName));
    if (r) setState(r.state);
    setBusy(false);
  }

  return (
    <div className="screen">
      <div style={{ margin: '18px 0 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, lineHeight: 1 }}>🏙️</div>
        <h1 style={{ marginTop: 8, letterSpacing: '0.05em' }}>БАНДЫ ПЕТЕРБУРГА</h1>
        <div className="dim small" style={{ marginTop: 4 }}>
          Питер, конец девяностых. Район сам себя не удержит.
        </div>
      </div>

      {step === 0 && (
        <>
          <h2>Шаг 1 · За кого держишь</h2>
          <div className="stack">
            {FACTION_IDS.map((id) => {
              const f = FACTIONS[id];
              const line = unitsOfFaction(id);
              return (
                <button
                  key={id}
                  className={`card${faction === id ? ' on' : ''}`}
                  onClick={() => { setFaction(id); haptic('select'); }}
                >
                  <span className="ic">{f.icon}</span>
                  <span className="grow">
                    <b>{f.name}</b>
                    <div className="tiny dim" style={{ marginTop: 2 }}>«{f.tagline}»</div>
                    <div className="tiny faint" style={{ marginTop: 3 }}>
                      {f.district} · {f.bonus}
                    </div>
                    <div className="tiny faint" style={{ marginTop: 3 }}>
                      {line.map((u) => u.icon).join(' ')}
                    </div>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            className="btn primary block"
            style={{ marginTop: 12 }}
            disabled={!faction}
            onClick={() => setStep(1)}
          >
            Дальше
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <h2>Шаг 2 · Кто ты сам</h2>
          <div className="stack">
            {MVP_CLASSES.map((id) => {
              const c = HERO_CLASSES[id];
              return (
                <button
                  key={id}
                  className={`card${heroClass === id ? ' on' : ''}`}
                  onClick={() => { setHeroClass(id); haptic('select'); }}
                >
                  <span className="ic">{c.icon}</span>
                  <span className="grow">
                    <b>{c.name}</b>
                    <div className="tiny dim" style={{ marginTop: 2 }}>{c.perk}</div>
                    <div className="tiny faint num" style={{ marginTop: 3 }}>
                      Сила {c.attack} · Броня {c.defense} · Авторитет {c.power} · Связи {c.knowledge}
                    </div>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn" onClick={() => setStep(0)}>Назад</button>
            <button className="btn primary grow" disabled={!heroClass} onClick={() => setStep(2)}>
              Дальше
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h2>Шаг 3 · Как тебя звать на районе</h2>
          <input
            className="input"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            placeholder="Кличка"
          />
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="row spread small">
              <span className="dim">Клан</span>
              <b>{faction ? FACTIONS[faction].name : '—'}</b>
            </div>
            <div className="row spread small" style={{ marginTop: 5 }}>
              <span className="dim">Ты</span>
              <b>{heroClass ? HERO_CLASSES[heroClass].name : '—'}</b>
            </div>
            <div className="tiny faint" style={{ marginTop: 8 }}>
              На старте: 1 500 налика, двор, ларёк и двадцать своих пацанов.
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setStep(1)}>Назад</button>
            <button className="btn primary grow" disabled={busy} onClick={() => void finish()}>
              {busy ? 'Заезжаем...' : 'Заехать на район'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
