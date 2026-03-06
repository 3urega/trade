import { useState, useEffect, useCallback } from 'react';
import { fetchTradingConfig, updateTradingConfig, fetchAvailableModels } from '../services/api.ts';
import type { TradingConfig, AvailableModel, ForwardTestMetrics } from '../types/index.ts';

interface Props {
  onClose: () => void;
}

type Section = 'strategy' | 'execution' | 'risk';

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function ModelRow({ model, selected, onSelect }: {
  model: AvailableModel;
  selected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-lg border transition-colors ${
        selected
          ? 'border-cyan-500 bg-cyan-500/10'
          : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
      }`}
    >
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-3"
        onClick={onSelect}
      >
        <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
          selected ? 'border-cyan-400 bg-cyan-400' : 'border-gray-600'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-200">{model.symbol}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{model.timeframe}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-400">{model.modelType}</span>
            {model.skillScore !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                model.skillScore > 0 ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
              }`}>
                Skill {fmt(model.skillScore, 3)}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {new Date(model.trainedAt).toLocaleDateString()} · {model.forwardTests.length} forward test{model.forwardTests.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          className="ml-auto text-gray-500 hover:text-gray-300 px-2 py-1 text-xs"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 px-4 py-3 space-y-3">
          {model.directionalAccuracy !== undefined && (
            <div className="flex gap-4 text-xs text-gray-400">
              <span>Dir. Accuracy: <span className="text-gray-200">{fmt(model.directionalAccuracy, 1)}%</span></span>
              {model.skillScore !== undefined && (
                <span>Skill Score: <span className={model.skillScore > 0 ? 'text-green-400' : 'text-red-400'}>
                  {fmt(model.skillScore, 4)}
                </span></span>
              )}
            </div>
          )}
          {model.forwardTests.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 text-left">
                    <th className="pb-1 pr-3">Period</th>
                    <th className="pb-1 pr-3">Return</th>
                    <th className="pb-1 pr-3">Win Rate</th>
                    <th className="pb-1 pr-3">Sharpe</th>
                    <th className="pb-1">Max DD</th>
                  </tr>
                </thead>
                <tbody>
                  {model.forwardTests.map((ft: ForwardTestMetrics) => (
                    <tr key={ft.sessionId} className="border-t border-gray-700/50">
                      <td className="py-1 pr-3 text-gray-400">
                        {new Date(ft.from).toLocaleDateString()} – {new Date(ft.to).toLocaleDateString()}
                      </td>
                      <td className={`py-1 pr-3 font-mono ${ft.totalReturnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {ft.totalReturnPct >= 0 ? '+' : ''}{fmt(ft.totalReturnPct, 2)}%
                      </td>
                      <td className="py-1 pr-3 text-gray-200">{pct(ft.winRate)}</td>
                      <td className={`py-1 pr-3 ${ft.sharpeRatio >= 0 ? 'text-gray-200' : 'text-red-400'}`}>
                        {fmt(ft.sharpeRatio, 2)}
                      </td>
                      <td className="py-1 text-red-400">{pct(ft.maxDrawdown)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-gray-600">No forward tests available for this model.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function TradingConfigModal({ onClose }: Props) {
  const [config, setConfig] = useState<TradingConfig | null>(null);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<Section>('strategy');

  const load = useCallback(async () => {
    const [cfg, mdls] = await Promise.all([fetchTradingConfig(), fetchAvailableModels()]);
    setConfig(cfg);
    setModels(mdls);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTradingConfig(config);
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      const fresh = await fetchTradingConfig();
      setConfig(fresh);
    } catch { /* ignore */ }
  };

  const set = <K extends keyof TradingConfig>(key: K, value: TradingConfig[K]) => {
    setConfig((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const toggleSection = (s: Section) => setOpenSection((prev) => (prev === s ? s : s));

  if (!config) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-gray-900 rounded-xl p-8">
          <p className="text-gray-400 text-sm animate-pulse">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  const sectionHeader = (id: Section, label: string, desc: string) => (
    <button
      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
      onClick={() => setOpenSection(id)}
    >
      <div>
        <span className="text-sm font-semibold text-gray-200">{label}</span>
        <span className="ml-2 text-xs text-gray-500">{desc}</span>
      </div>
      <span className="text-gray-500 text-xs">{openSection === id ? '▲' : '▼'}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-100">Configuración de Trading</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* STRATEGY */}
          <div className="border-b border-gray-700">
            {sectionHeader('strategy', 'Estrategia', 'Modelo, señal y posición')}
            {openSection === 'strategy' && (
              <div className="px-4 pb-4 space-y-4">
                {/* Model selector */}
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Modelo ML</label>

                  {/* Latest option */}
                  <div
                    className={`rounded-lg border px-4 py-2.5 mb-2 cursor-pointer transition-colors ${
                      config.modelSnapshotId === 'latest'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
                    }`}
                    onClick={() => set('modelSnapshotId', 'latest')}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                        config.modelSnapshotId === 'latest' ? 'border-cyan-400 bg-cyan-400' : 'border-gray-600'
                      }`} />
                      <span className="text-sm text-gray-200">Último modelo entrenado</span>
                      <span className="text-xs text-gray-500 ml-auto">Auto</span>
                    </div>
                  </div>

                  {models.length === 0 && (
                    <p className="text-xs text-gray-600 px-1">No hay modelos disponibles. Entrena uno en la sección Research.</p>
                  )}

                  <div className="space-y-2">
                    {models.map((m) => (
                      <ModelRow
                        key={m.snapshotId}
                        model={m}
                        selected={config.modelSnapshotId === m.snapshotId}
                        onSelect={() => set('modelSnapshotId', m.snapshotId)}
                      />
                    ))}
                  </div>
                </div>

                {/* Threshold */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Umbral de señal (logReturn)</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={config.signalThreshold}
                      onChange={(e) => set('signalThreshold', parseFloat(e.target.value) || 0)}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none"
                    />
                    <p className="text-xs text-gray-600 mt-0.5">0.0005 = 0.05%</p>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Modo de posición</label>
                    <select
                      value={config.positionMode}
                      onChange={(e) => set('positionMode', e.target.value as 'fixed' | 'percent')}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="fixed">Cantidad fija</option>
                      <option value="percent">% del capital</option>
                    </select>
                  </div>

                  {config.positionMode === 'fixed' ? (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Cantidad fija (base currency)</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.00001"
                        value={config.fixedAmount}
                        onChange={(e) => set('fixedAmount', parseFloat(e.target.value) || 0.001)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">% del capital por trade</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="1"
                        value={config.positionSizePct}
                        onChange={(e) => set('positionSizePct', parseFloat(e.target.value) || 0.5)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none"
                      />
                      <p className="text-xs text-gray-600 mt-0.5">0.5 = 50% del capital disponible</p>
                    </div>
                  )}
                </div>

                {/* Active pairs */}
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Pares activos</label>
                  <div className="flex flex-wrap gap-2">
                    {['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'ADA/USDT'].map((pair) => {
                      const active = config.activePairs.includes(pair);
                      return (
                        <button
                          key={pair}
                          onClick={() => {
                            const next = active
                              ? config.activePairs.filter((p) => p !== pair)
                              : [...config.activePairs, pair];
                            if (next.length > 0) set('activePairs', next);
                          }}
                          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                            active
                              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                              : 'border-gray-700 text-gray-500 hover:border-gray-600'
                          }`}
                        >
                          {pair}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* EXECUTION */}
          <div className="border-b border-gray-700">
            {sectionHeader('execution', 'Ejecución', 'Timeframe, polling, cooldown')}
            {openSection === 'execution' && (
              <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Timeframe de señal</label>
                  <select
                    value={config.signalTimeframe}
                    onChange={(e) => set('signalTimeframe', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none"
                  >
                    {['1m', '5m', '15m', '1h'].map((tf) => (
                      <option key={tf} value={tf}>{tf}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Intervalo de polling (ms)</label>
                  <input
                    type="number"
                    step="1000"
                    min="1000"
                    value={config.pollingIntervalMs}
                    onChange={(e) => set('pollingIntervalMs', parseInt(e.target.value) || 5000)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-600 mt-0.5">{(config.pollingIntervalMs / 1000).toFixed(0)}s entre ticks</p>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Cooldown entre trades (ms)</label>
                  <input
                    type="number"
                    step="1000"
                    min="0"
                    value={config.cooldownMs}
                    onChange={(e) => set('cooldownMs', parseInt(e.target.value) || 0)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-600 mt-0.5">0 = sin cooldown</p>
                </div>
              </div>
            )}
          </div>

          {/* RISK */}
          <div>
            {sectionHeader('risk', 'Riesgo', 'Stop-loss, take-profit, drawdown máximo')}
            {openSection === 'risk' && (
              <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                <NullableNumberInput
                  label="Stop-loss (%)"
                  hint="e.g. 5 = cerrar si cae 5%. Vacío = desactivado"
                  value={config.stopLossPct}
                  min={0.1}
                  max={100}
                  step={0.1}
                  onChange={(v) => set('stopLossPct', v !== null ? v / 100 : null)}
                  displayMultiplier={100}
                />
                <NullableNumberInput
                  label="Take-profit (%)"
                  hint="e.g. 10 = cerrar si sube 10%. Vacío = desactivado"
                  value={config.takeProfitPct}
                  min={0.1}
                  max={1000}
                  step={0.1}
                  onChange={(v) => set('takeProfitPct', v !== null ? v / 100 : null)}
                  displayMultiplier={100}
                />
                <NullableNumberInput
                  label="Max drawdown cartera (%)"
                  hint="Pausa el trading si la cartera cae X% desde su máximo. Vacío = sin límite"
                  value={config.maxDrawdownPct}
                  min={1}
                  max={100}
                  step={1}
                  onChange={(v) => set('maxDrawdownPct', v !== null ? v / 100 : null)}
                  displayMultiplier={100}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700 flex-shrink-0">
          {error && <p className="text-xs text-red-400 flex-1 mr-4 truncate">{error}</p>}
          {!error && <div className="flex-1" />}
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="text-xs px-4 py-2 rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
            >
              Recargar
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className={`text-xs px-5 py-2 rounded font-medium transition-colors ${
                saved
                  ? 'bg-green-600 text-white border border-green-500'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-500 disabled:opacity-50'
              }`}
            >
              {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NullableNumberInput({
  label, hint, value, min, max, step, onChange, displayMultiplier = 1,
}: {
  label: string;
  hint?: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  onChange: (v: number | null) => void;
  displayMultiplier?: number;
}) {
  const displayVal = value !== null ? (value * displayMultiplier).toFixed(1) : '';

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        placeholder="—"
        value={displayVal}
        onChange={(e) => {
          const v = e.target.value === '' ? null : parseFloat(e.target.value);
          onChange(v);
        }}
        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none"
      />
      {hint && <p className="text-xs text-gray-600 mt-0.5">{hint}</p>}
    </div>
  );
}
