import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Modal } from './ui';
import { ToastView } from './ToastView';
import { ScheduleTimeline } from './ScheduleTimeline';
import { NowProvider } from '../lib/now';

describe('view infrastructure', () => {
  it('Modal inline renders open dialog without showModal', () => {
    const html = renderToStaticMarkup(
      <Modal open inline onClose={() => {}} title="Заголовок">
        тело
      </Modal>,
    );
    expect(html).toContain('<dialog open');
    expect(html).toContain('modal-inline-backdrop');
    expect(html).toContain('Заголовок');
  });

  it('Modal default path has no inline backdrop', () => {
    const html = renderToStaticMarkup(
      <Modal open onClose={() => {}} title="X">
        y
      </Modal>,
    );
    expect(html).not.toContain('modal-inline-backdrop');
    expect(html).not.toContain('<dialog open');
  });

  it('ToastView renders kinds', () => {
    const html = renderToStaticMarkup(
      <ToastView
        toasts={[
          { id: 1, kind: 'success', text: 'Сохранено' },
          { id: 2, kind: 'error', text: 'Ошибка' },
        ]}
      />,
    );
    expect(html).toContain('data-kind="success"');
    expect(html).toContain('data-kind="error"');
    expect(html).toContain('Сохранено');
    expect(html).toContain('toast-wrap');
  });

  it('ScheduleTimeline uses NowProvider', () => {
    // Local-time Dates keep the test independent of the process timezone.
    const now = new Date(2026, 10, 18, 10, 40);
    const html = renderToStaticMarkup(
      <NowProvider value={now}>
        <ScheduleTimeline
          days={[new Date(2026, 10, 18)]}
          events={[]}
          cfg={{ startHour: 8, endHour: 20, slotMin: 30, pxPerMin: 1 }}
        />
      </NowProvider>,
    );
    expect(html).toMatch(/class="stl-now"[^>]*style="[^"]*top:160px/);
  });
});
