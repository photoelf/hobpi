import {
  ABILITIES, ARTIFACTS, RARITY_COLORS, RARITY_NAMES, SLOT_NAMES, SLOT_ORDER,
  abilitiesForGuild,
} from '@hobpi/engine';
import type { ArtifactSlot } from '@hobpi/engine';
import { api } from '../api.ts';
import { useGame } from '../state.tsx';
import { Bar, Panel, num } from '../ui/kit.tsx';

export function Hero() {
  const { state, run } = useGame();
  if (!state) return null;
  const { player: p, artifacts, buildings } = state;
  const s = p.stats;

  const equipped = new Map<ArtifactSlot, { id: number; artId: string }>();
  for (const a of artifacts) {
    const def = ARTIFACTS[a.artId];
    if (a.equipped && def) equipped.set(def.slot, { id: a.id, artId: a.artId });
  }
  const bag = artifacts.filter((a) => !a.equipped);
  const guild = buildings.sigarnaya ?? 0;
  const known = abilitiesForGuild(guild);

  const xpInLevel = p.xp - p.xpCurrent;
  const xpNeeded = Math.max(1, p.xpNext - p.xpCurrent);

  return (
    <div className="screen">
      <Panel tight>
        <div className="row spread">
          <div className="grow">
            <b style={{ fontSize: 17 }}>{p.name}</b>
            <div className="tiny faint">{p.heroClassName} · {p.factionName}</div>
          </div>
          <span className="pill">{p.rank}</span>
        </div>
        <div className="row spread tiny num" style={{ marginTop: 8, marginBottom: 3 }}>
          <span className="faint">уровень {p.level}</span>
          <span className="faint">{num(xpInLevel)} / {num(xpNeeded)}</span>
        </div>
        <Bar value={xpInLevel} max={xpNeeded} xp />
      </Panel>

      <Panel title="Статы">
        <div className="choice-grid">
          {[
            ['⚔️ Сила', s.attack, '+5% урона бригады за очко'],
            ['🛡️ Броня', s.defense, '−2.5% входящего урона за очко'],
            ['🎖️ Авторитет', s.power, 'сила приёмов'],
            ['☎️ Связи', s.knowledge, `запас связей в бою: ${s.knowledge * 10}`],
            ['😤 Мораль', s.morale, 'шанс на доп. ход'],
            ['🍀 Удача', s.luck, 'шанс на двойной урон'],
          ].map(([label, value, hint]) => (
            <div className="panel tight" key={label as string} style={{ margin: 0 }}>
              <div className="row spread">
                <span className="small">{label}</span>
                <b className="num gold">{value as number}</b>
              </div>
              <div className="tiny faint">{hint}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Прикид" right={<span className="tiny faint">тапни, чтобы снять</span>}>
        <div className="doll">
          {SLOT_ORDER.map((slot) => {
            const eq = equipped.get(slot);
            const def = eq ? ARTIFACTS[eq.artId] : null;
            return (
              <button
                key={slot}
                className={`slot${def ? ' filled' : ''}`}
                style={def ? { borderColor: RARITY_COLORS[def.rarity] } : undefined}
                disabled={!eq}
                onClick={() => eq && void run(() => api.unequip(eq.id), 'Снял')}
              >
                <em>{def?.icon ?? '·'}</em>
                <span>{def ? def.name : SLOT_NAMES[slot]}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title={`Барахло · ${bag.length}`}>
        {bag.length === 0 && <div className="faint small">Пусто. Вещи падают с дворов.</div>}
        {bag.map((a) => {
          const def = ARTIFACTS[a.artId];
          if (!def) return null;
          return (
            <div className="card" key={a.id}>
              <span className="ic">{def.icon}</span>
              <span className="grow">
                <b>{def.name}</b>{' '}
                <span className="tiny" style={{ color: RARITY_COLORS[def.rarity] }}>
                  {RARITY_NAMES[def.rarity]}
                </span>
                <div className="tiny faint">{SLOT_NAMES[def.slot]} · {def.desc}</div>
              </span>
              <button className="btn sm" onClick={() => void run(() => api.equip(a.id), 'Надел')}>
                Надеть
              </button>
            </div>
          );
        })}
      </Panel>

      <Panel title={`Приёмы · сигарная ур. ${guild}`}>
        {known.length === 0 && <div className="faint small">Построй Сигарную комнату на базе</div>}
        {known.map((id) => {
          const a = ABILITIES[id];
          if (!a) return null;
          return (
            <div className="card" key={id}>
              <span className="ic">{a.icon}</span>
              <span className="grow">
                <b>{a.name}</b> <span className="tiny faint">☎️ {a.cost}</span>
                <div className="tiny faint">{a.desc}</div>
              </span>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
