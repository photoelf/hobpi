import { UNITS } from '@hobpi/engine';

export interface FieldStack {
  id: number;
  unitId: string;
  side: 'A' | 'B';
  x: number;
  y: number;
  count: number;
}

export type Highlight = 'move' | 'attack' | 'cast';

export function Field({
  width, height, stacks, activeId, highlight, hitIds, onCell,
}: {
  width: number;
  height: number;
  stacks: FieldStack[];
  activeId?: number | null;
  highlight?: Map<number, Highlight>;
  hitIds?: Set<number>;
  onCell?: (x: number, y: number) => void;
}) {
  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = y * 100 + x;
      const st = stacks.find((s) => s.x === x && s.y === y && s.count > 0);
      const hl = highlight?.get(k);
      const u = st ? UNITS[st.unitId] : undefined;
      const classes = [
        'cell',
        (x + y) % 2 ? 'alt' : '',
        hl ?? '',
        st && st.id === activeId ? 'active' : '',
        st && hitIds?.has(st.id) ? 'hit' : '',
      ].filter(Boolean).join(' ');

      cells.push(
        <button
          key={k}
          className={classes}
          onClick={onCell ? () => onCell(x, y) : undefined}
          disabled={!onCell}
          aria-label={u ? `${u.name}, ${st!.count}` : `клетка ${x},${y}`}
        >
          {st && u && (
            <span className={`unit ${st.side}`}>
              <span>{u.icon}</span>
              <span className="cnt">{st.count}</span>
            </span>
          )}
        </button>,
      );
    }
  }

  return (
    <div className="field-wrap">
      <div className="field" style={{ gridTemplateColumns: `repeat(${width}, 1fr)` }}>
        {cells}
      </div>
    </div>
  );
}
