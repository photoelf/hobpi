import type { ReactNode } from 'react';
import type { Cost } from '@hobpi/engine';
import { useGame } from '../state.tsx';

export const RES_ICON: Record<string, string> = {
  nal: '💵', influence: '⭐', svyazi: '☎️', tovar: '📦', fuel: '⛽',
};

export const RES_NAME: Record<string, string> = {
  nal: 'налик', influence: 'влияние', svyazi: 'связи', tovar: 'товар', fuel: 'топливо',
};

export const num = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 10_000 ? `${Math.round(n / 1000)}K`
      : n.toLocaleString('ru-RU');

/** Строка ресурсов вверху экрана. */
export function ResourceBar() {
  const { state } = useGame();
  if (!state) return null;
  const p = state.player;
  const items: Array<[string, number, boolean]> = [
    ['nal', p.nal, p.nal >= p.vaultCap],
    ['tovar', p.tovar, false],
    ['influence', p.influence, false],
    ['svyazi', p.svyazi, false],
    ['fuel', p.fuel, p.fuel === 0],
  ];
  return (
    <div className="res-row">
      {items.map(([k, v, low]) => (
        <div className={`res${low ? ' low' : ''}`} key={k} title={RES_NAME[k]}>
          <span>{RES_ICON[k]}</span>
          <b>{k === 'fuel' ? `${v}/${p.fuelMax}` : num(v)}</b>
        </div>
      ))}
    </div>
  );
}

/** Цена в ресурсах; красным подсвечивается то, чего не хватает. */
export function CostView({ cost, have }: { cost: Cost; have?: Record<string, number> }) {
  const parts = Object.entries(cost).filter(([, v]) => (v as number) > 0);
  if (!parts.length) return <span className="faint tiny">бесплатно</span>;
  return (
    <span className="row tiny num" style={{ gap: 7 }}>
      {parts.map(([k, v]) => {
        const short = have ? (have[k] ?? 0) < (v as number) : false;
        return (
          <span key={k} className={short ? 'bad' : 'dim'}>
            {RES_ICON[k]} {num(v as number)}
          </span>
        );
      })}
    </span>
  );
}

export function Panel({
  title, children, tight, right,
}: { title?: string; children: ReactNode; tight?: boolean; right?: ReactNode }) {
  return (
    <div className={`panel${tight ? ' tight' : ''}`}>
      {title && (
        <div className="row spread">
          <h2>{title}</h2>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Sheet({
  title, onClose, children,
}: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row spread" style={{ marginBottom: 10 }}>
          <h1>{title}</h1>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Bar({ value, max, xp }: { value: number; max: number; xp?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`bar${xp ? ' xp' : ''}`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="center dim small">{text}</div>;
}
