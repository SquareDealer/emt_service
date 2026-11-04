import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoardView } from './BoardView';
import type { BoardViewProps, Columns } from './BoardView';
import type { WorkOrder } from '../../lib/types';

const noop = () => {};
const wo = (id: string, status: WorkOrder['status']) =>
  ({ id, status, title: `Наряд ${id}`, total_cached: 1000, vehicle: null }) as unknown as WorkOrder;
const columns: Columns = {
  scheduled: [wo('a', 'scheduled'), wo('b', 'scheduled')],
  in_progress: [wo('c', 'in_progress')],
  waiting: [],
  done: [],
  closed: [],
};
const base = (over: Partial<BoardViewProps> = {}): BoardViewProps => ({
  columns,
  showMaster: false,
  activeId: null,
  onOpen: noop,
  onDragStart: noop,
  onDragEnd: noop,
  ...over,
});
const html = (p: Partial<BoardViewProps> = {}) => renderToStaticMarkup(<BoardView {...base(p)} />);

describe('BoardView', () => {
  it('renders columns and cards with demo hooks', () => {
    const h = html();
    expect(h.match(/data-demo="board-col"/g)).toHaveLength(5);
    expect(h).toContain('data-status="in_progress"');
    expect(h.match(/data-demo="board-card"/g)).toHaveLength(3);
    expect(h).toContain('data-id="a"');
  });

  it('overStatus marks the column body like a real isOver', () => {
    expect(html()).not.toMatch(/board-col-body over/);
    const h = html({ overStatus: 'in_progress' });
    expect(h.match(/board-col-body over/g)).toHaveLength(1);
    expect(h).toMatch(/data-status="in_progress"[^>]*>(?:(?!data-demo="board-col").)*board-col-body over/);
  });

  it('ghostId dims only that card like a real drag', () => {
    expect(html()).not.toContain('opacity:0.35');
    const h = html({ ghostId: 'a' });
    expect(h.match(/opacity:0\.35/g)).toHaveLength(1);
    expect(h).toMatch(/data-id="a"[^>]*style="opacity:0\.35"|style="opacity:0\.35"[^>]*data-id="a"/);
  });

  it('rowStyle merges into the card wrapper by index', () => {
    const h = html({ rowStyle: (i) => (i === 1 ? { marginTop: 7 } : {}) });
    expect(h.match(/margin-top:7px/g)).toHaveLength(1);
    expect(html()).not.toContain('margin-top');
  });

  it('highlightId sets data-highlight and hoverId sets data-hover, each on one card', () => {
    const h = html({ highlightId: 'c' });
    expect(h.match(/data-highlight/g)).toHaveLength(1);
    expect(h).not.toContain('data-hover');
    const g = html({ hoverId: 'a' });
    expect(g.match(/data-hover/g)).toHaveLength(1);
    expect(g).not.toContain('data-highlight');
    const n = html();
    expect(n).not.toContain('data-highlight');
    expect(n).not.toContain('data-hover');
  });

  it('loading shows a spinner instead of columns', () => {
    expect(html({ loading: true })).not.toContain('board-col');
  });
});
