import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { Modal, Spinner } from '../../components/ui';
import { PartsCatalog } from './PartsCatalog';
import { TemplatePartsModal } from './TemplatePartsModal';
import { PriceListView, genLabel } from './PriceListView';
import type { PriceListRow, VehicleGeneration } from '../../lib/types';

const GEN_KEY = 'crm-price-generation';

export function PriceListPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'works' | 'parts'>('works');
  // One generation at a time: a 15-column matrix is unreadable on a workshop
  // tablet, and the shop thinks in terms of «открыть прайс R56» anyway.
  const [generationId, setGenerationId] = useState<string>(
    () => localStorage.getItem(GEN_KEY) ?? '',
  );
  const [copyOpen, setCopyOpen] = useState(false);
  const [partsFor, setPartsFor] = useState<PriceListRow | null>(null);

  useEffect(() => {
    try {
      if (generationId) localStorage.setItem(GEN_KEY, generationId);
    } catch { /* ignore */ }
  }, [generationId]);

  const { data: generations } = useQuery({
    queryKey: ['vehicle-generations'],
    queryFn: () => api.vehicleGenerations(),
  });
  const { data: rows, isLoading } = useQuery({
    queryKey: ['price-list', generationId],
    queryFn: () => api.priceList(generationId || undefined),
  });

  const current = (generations ?? []).find((g) => g.id === generationId);

  const mSet = useMutation({
    mutationFn: ({ templateId, hours, price }: { templateId: string; hours: number | null; price: number | null }) =>
      api.setPrice(templateId, generationId, { hours, price }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-list'] }),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mClear = useMutation({
    mutationFn: (templateId: string) => api.clearPrice(templateId, generationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-list'] });
      toast('Вернули базовую цену', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const withOverride = useMemo(
    () => (rows ?? []).filter((r) => r.override).length,
    [rows],
  );

  return (
    <>
      <PriceListView
        tab={tab}
        generations={generations ?? []}
        generationId={generationId || null}
        rows={rows}
        loading={isLoading}
        withOverride={withOverride}
        busy={mSet.isPending}
        partsSlot={<PartsCatalog />}
        onTab={setTab}
        onGeneration={(id) => setGenerationId(id ?? '')}
        onSave={(templateId, hours, price) => mSet.mutate({ templateId, hours, price })}
        onClear={(templateId) => mClear.mutate(templateId)}
        onEditParts={setPartsFor}
        onCopy={() => setCopyOpen(true)}
      />

      {tab === 'works' && (
        <>
          <TemplatePartsModal
            templateId={partsFor?.template.id ?? null}
            templateName={partsFor?.template.name ?? ''}
            generation={current ?? null}
            onClose={() => setPartsFor(null)}
          />

          <CopyPricesModal
            open={copyOpen}
            onClose={() => setCopyOpen(false)}
            generations={generations ?? []}
            target={current ?? null}
          />
        </>
      )}
    </>
  );
}

/** Bulk fill — without it nobody would ever populate 15 generations by hand. */
function CopyPricesModal({
  open,
  onClose,
  generations,
  target,
}: {
  open: boolean;
  onClose: () => void;
  generations: VehicleGeneration[];
  target: VehicleGeneration | null;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [mode, setMode] = useState<'fill' | 'replace'>('fill');

  useEffect(() => { if (open) { setFrom(''); setMode('fill'); } }, [open]);

  const mCopy = useMutation({
    mutationFn: () =>
      api.copyPrices({ from_generation_id: from, to_generation_id: target!.id, mode }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['price-list'] });
      toast(`Скопировано ${r.copied}, пропущено ${r.skipped}`, 'success');
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Скопировать цены в ${target ? genLabel(target) : ''}`}
      width={480}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={mCopy.isPending}>Отмена</button>
          <button
            className="btn btn-primary"
            onClick={() => mCopy.mutate()}
            disabled={!from || !target || mCopy.isPending}
          >
            {mCopy.isPending ? <Spinner /> : <Copy size={16} />} Скопировать
          </button>
        </>
      }
    >
      <div className="col gap-3">
        <div className="field">
          <label className="label">Откуда</label>
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Выберите поколение</option>
            {generations.filter((g) => g.id !== target?.id).map((g) => (
              <option key={g.id} value={g.id}>{genLabel(g)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Что делать с уже заданными ценами</label>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as 'fill' | 'replace')}>
            <option value="fill">Не трогать — заполнить только пустые</option>
            <option value="replace">Перезаписать</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
