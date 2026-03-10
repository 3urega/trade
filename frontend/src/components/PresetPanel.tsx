import { useState, useEffect, useCallback } from 'react';
import {
  fetchPresets, fetchPresetsCompare, fetchPresetMetrics,
  activatePreset, pausePreset, deletePreset,
} from '../services/api.ts';
import { onPresetStateChange } from '../services/socket.ts';
import type { Preset, PresetMetrics } from '../types/index.ts';
import { TradingConfigModal } from './TradingConfigModal.tsx';

interface Props {
  /** The currently selected preset ID (highlights that card) */
  selectedPresetId: string | null;
  /** Called when the user clicks a preset card to view its portfolio */
  onSelectPreset: (presetId: string) => void;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-900/40 text-green-400 border-green-700/40',
    paused: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40',
    archived: 'bg-gray-800 text-gray-500 border-gray-700',
  };
  const labels: Record<string, string> = { active: 'Activo', paused: 'Pausado', archived: 'Archivado' };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${map[status] ?? map['archived']}`}>
      {labels[status] ?? status}
    </span>
  );
}

function PnlBadge({ pnl, pnlPercent }: { pnl: number; pnlPercent: number }) {
  const pos = pnl >= 0;
  return (
    <span className={`font-mono text-xs ${pos ? 'text-green-400' : 'text-red-400'}`}>
      {pos ? '+' : ''}{pnl.toFixed(2)} ({pos ? '+' : ''}{pnlPercent.toFixed(2)}%)
    </span>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</span>
      <span className="text-xs text-gray-300 font-medium tabular-nums">{value}</span>
    </div>
  );
}

function IconBtn({
  title, onClick, disabled, children, danger,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors disabled:opacity-40 ${
        danger
          ? 'text-gray-600 hover:text-red-400 hover:bg-red-400/10'
          : 'text-gray-500 hover:text-gray-200 hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function PresetPanel({ selectedPresetId, onSelectPreset }: Props) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [metrics, setMetrics] = useState<Map<string, PresetMetrics>>(new Map());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [all, activeMetrics] = await Promise.all([
        fetchPresets(),
        fetchPresetsCompare().catch(() => [] as PresetMetrics[]),
      ]);
      setPresets(all);
      const map = new Map<string, PresetMetrics>();
      for (const m of activeMetrics) map.set(m.presetId, m);
      setMetrics(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Reactively refresh a single preset's metrics when its state changes
  useEffect(() => {
    return onPresetStateChange(async (_change) => {
      void loadData();
    });
  }, [loadData]);

  const setActionBusy = (id: string, busy: boolean) => {
    setActionLoading((prev) => {
      const next = new Set(prev);
      busy ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleToggleRunning = async (preset: Preset) => {
    setActionBusy(preset.id, true);
    try {
      if (preset.status === 'active') {
        await pausePreset(preset.id);
      } else {
        await activatePreset(preset.id);
      }
      void loadData();
    } finally {
      setActionBusy(preset.id, false);
    }
  };

  const handleArchive = async (preset: Preset) => {
    if (!confirm(`¿Archivar el preset "${preset.name}"? Se detendrá su simulación.`)) return;
    setActionBusy(preset.id, true);
    try {
      await deletePreset(preset.id);
      void loadData();
      if (selectedPresetId === preset.id) onSelectPreset('');
    } finally {
      setActionBusy(preset.id, false);
    }
  };

  const handleLoadMetrics = async (presetId: string) => {
    try {
      const m = await fetchPresetMetrics(presetId);
      setMetrics((prev) => new Map(prev).set(presetId, m));
    } catch { /* ignore */ }
  };

  // Sort: active first, paused second, archived last
  const sorted = [...presets].sort((a, b) => {
    const order: Record<string, number> = { active: 0, paused: 1, archived: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  const statusBorderColor: Record<string, string> = {
    active: 'border-l-cyan-500',
    paused: 'border-l-yellow-600',
    archived: 'border-l-gray-700',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24 text-gray-600 text-xs animate-pulse">
        Cargando presets…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Presets</h2>
        <button
          onClick={() => setCreateOpen(true)}
          title="Nuevo preset"
          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-cyan-700/50 text-cyan-500 hover:bg-cyan-500/10 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          <span>Nuevo</span>
        </button>
      </div>

      {sorted.length === 0 && (
        <p className="text-xs text-gray-600 py-3 text-center">
          No hay presets. Crea uno para empezar.
        </p>
      )}

      {sorted.map((preset) => {
        const m = metrics.get(preset.id);
        const isSelected = selectedPresetId === preset.id;
        const isBusy = actionLoading.has(preset.id);
        const isRunning = m?.isRunning ?? false;

        return (
          <div
            key={preset.id}
            onClick={() => {
              onSelectPreset(preset.id);
              if (!metrics.has(preset.id)) void handleLoadMetrics(preset.id);
            }}
            className={`
              border-l-2 rounded-r-lg border border-gray-700/60 bg-gray-800/40 cursor-pointer
              transition-all hover:border-gray-600 hover:bg-gray-800/70
              ${statusBorderColor[preset.status] ?? 'border-l-gray-700'}
              ${isSelected ? 'bg-gray-800/80 ring-1 ring-cyan-500/30' : ''}
            `}
          >
            {/* Card header */}
            <div className="px-3 pt-2.5 pb-1.5 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {isRunning && (
                  <span className="relative flex h-2 w-2 flex-shrink-0 mt-0.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                )}
                <span className="text-sm font-semibold text-gray-100 truncate">{preset.name}</span>
                <StatusBadge status={preset.status} />
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {preset.status !== 'archived' && (
                  <IconBtn
                    title={preset.status === 'active' ? 'Pausar' : 'Activar'}
                    onClick={() => void handleToggleRunning(preset)}
                    disabled={isBusy}
                  >
                    {preset.status === 'active' ? <PauseIcon /> : <PlayIcon />}
                  </IconBtn>
                )}
                <IconBtn
                  title="Editar configuración"
                  onClick={() => setEditingPreset(preset)}
                  disabled={isBusy}
                >
                  <GearIcon />
                </IconBtn>
                {preset.status !== 'archived' && (
                  <IconBtn
                    title="Archivar preset"
                    onClick={() => void handleArchive(preset)}
                    disabled={isBusy}
                    danger
                  >
                    <TrashIcon />
                  </IconBtn>
                )}
              </div>
            </div>

            {/* Metrics row */}
            <div className="px-3 pb-2.5">
              {m ? (
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <div className="col-span-2">
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider block">Valor</span>
                    <span className="text-xs font-semibold text-gray-200 tabular-nums">
                      ${m.totalValueUsdt.toFixed(2)}
                    </span>
                    <PnlBadge pnl={m.pnl} pnlPercent={m.pnlPercent} />
                  </div>
                  <MetricCell
                    label="Trades"
                    value={String(m.totalTrades)}
                  />
                  <MetricCell
                    label="Win Rate"
                    value={m.winRate !== null ? `${(m.winRate * 100).toFixed(0)}%` : '—'}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <MetricCell
                    label="Capital inicial"
                    value={`$${preset.initialCapital.toLocaleString()}`}
                  />
                  <MetricCell
                    label="Pares"
                    value={preset.config.activePairs.map((p) => p.split('/')[0]).join(' ')}
                  />
                </div>
              )}

              {/* Config pills */}
              <div className="flex flex-wrap gap-1 mt-2">
                {preset.config.activePairs.map((p) => (
                  <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-500">
                    {p}
                  </span>
                ))}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-500">
                  {preset.config.signalTimeframe}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Create modal */}
      {createOpen && (
        <TradingConfigModal
          createMode
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setCreateOpen(false);
            void loadData();
            onSelectPreset(created.id);
          }}
        />
      )}

      {/* Edit modal */}
      {editingPreset && (
        <TradingConfigModal
          preset={editingPreset}
          onClose={() => {
            setEditingPreset(null);
            void loadData();
          }}
        />
      )}
    </div>
  );
}
