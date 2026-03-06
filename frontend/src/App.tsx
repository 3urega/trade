import { useState, useEffect, useCallback } from 'react';
import { PortfolioPanel } from './components/PortfolioPanel.tsx';
import { PriceChart } from './components/PriceChart.tsx';
import { TradeList } from './components/TradeList.tsx';
import { ResearchPage } from './components/research/ResearchPage.tsx';
import { TradingConfigModal } from './components/TradingConfigModal.tsx';
import { PresetPanel } from './components/PresetPanel.tsx';
import { CompareView } from './components/CompareView.tsx';
import {
  fetchTrades, fetchPortfolio, fetchSignalStatus, fetchPresets,
} from './services/api.ts';
import {
  onTradeExecuted, onPortfolioUpdate, onSocketConnect,
  onSocketDisconnect, onPresetStateChange,
} from './services/socket.ts';
import type { Trade, Portfolio, Preset } from './types/index.ts';

type AppSection = 'trading' | 'compare' | 'research';

export default function App() {
  // ─── preset state ─────────────────────────────────────────────────────────
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // ─── portfolio / trade state for the selected preset ──────────────────────
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // ─── ui state ─────────────────────────────────────────────────────────────
  const [selectedPair, setSelectedPair] = useState('SOL/USDT');
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [section, setSection] = useState<AppSection>('trading');
  const [mlModelReady, setMlModelReady] = useState<boolean | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  // ─── derived ──────────────────────────────────────────────────────────────
  const selectedPreset = presets.find((p) => p.id === selectedPresetId) ?? null;
  const walletId = selectedPreset?.walletId ?? null;
  const activePairs = selectedPreset?.config.activePairs ?? ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];

  // ─── load portfolio + trades for given wallet ─────────────────────────────
  const loadData = useCallback(async (wid: string) => {
    setDataLoading(true);
    try {
      const [tradesData, portfolioData] = await Promise.all([
        fetchTrades(wid, 100),
        fetchPortfolio(wid),
      ]);
      setTrades(tradesData);
      setPortfolio(portfolioData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setDataLoading(false);
    }
  }, []);

  // ─── initial load: fetch presets, auto-select first active ───────────────
  useEffect(() => {
    fetchPresets()
      .then((ps) => {
        setPresets(ps);
        const firstActive = ps.find((p) => p.status === 'active');
        const toSelect = firstActive ?? ps[0] ?? null;
        if (toSelect) setSelectedPresetId(toSelect.id);
      })
      .catch(console.error);
  }, []);

  // ─── when selected preset changes → reload data ───────────────────────────
  useEffect(() => {
    if (!walletId) return;
    setPortfolio(null);
    setTrades([]);
    void loadData(walletId);
  }, [walletId, loadData]);

  // keep selected pair within the preset's active pairs list
  useEffect(() => {
    if (activePairs.length > 0 && !activePairs.includes(selectedPair)) {
      setSelectedPair(activePairs[0]);
    }
  }, [activePairs, selectedPair]);

  // ─── WebSocket: connection status ─────────────────────────────────────────
  useEffect(() => {
    const offConnect = onSocketConnect(() => {
      setWsStatus('connected');
      if (walletId) void loadData(walletId);
    });
    const offDisconnect = onSocketDisconnect(() => setWsStatus('error'));
    return () => { offConnect(); offDisconnect(); };
  }, [walletId, loadData]);

  // ─── WebSocket: real-time trades ──────────────────────────────────────────
  useEffect(() => {
    return onTradeExecuted((trade) => {
      // Accept if presetId matches OR walletId matches (backward compat)
      const matches =
        (selectedPresetId && trade.presetId === selectedPresetId) ||
        (walletId && trade.walletId === walletId);
      if (!matches) return;
      setTrades((prev) => [trade, ...prev].slice(0, 200));
      setLastUpdate(new Date());
    });
  }, [selectedPresetId, walletId]);

  // ─── WebSocket: real-time portfolio ───────────────────────────────────────
  useEffect(() => {
    return onPortfolioUpdate((update) => {
      const matches =
        (selectedPresetId && update.presetId === selectedPresetId) ||
        (walletId && update.walletId === walletId);
      if (!matches) return;
      setPortfolio(update);
      setLastUpdate(new Date());
    });
  }, [selectedPresetId, walletId]);

  // ─── WebSocket: preset lifecycle → refresh list ───────────────────────────
  useEffect(() => {
    return onPresetStateChange(() => {
      fetchPresets().then(setPresets).catch(console.error);
    });
  }, []);

  // ─── Backup polling every 30 s ────────────────────────────────────────────
  useEffect(() => {
    if (!walletId) return;
    const id = setInterval(() => void loadData(walletId), 30_000);
    return () => clearInterval(id);
  }, [walletId, loadData]);

  // ─── ML model status poll ─────────────────────────────────────────────────
  useEffect(() => {
    const check = () => void fetchSignalStatus().then((s) => setMlModelReady(s.modelReady));
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  // ─── "hace Xs" ticker ────────────────────────────────────────────────────
  useEffect(() => {
    if (!lastUpdate) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [lastUpdate]);

  // ─── handlers ────────────────────────────────────────────────────────────
  const handleSelectPreset = (presetId: string) => {
    if (presetId === selectedPresetId) return;
    setSelectedPresetId(presetId);
    // portfolio/trades cleared by the walletId useEffect above
  };

  const handleCompareSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    setSection('trading');
  };

  // ─── helpers ─────────────────────────────────────────────────────────────
  const lastUpdateLabel = (() => {
    if (!lastUpdate) return null;
    const secs = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
    if (secs < 5) return 'ahora';
    if (secs < 60) return `hace ${secs}s`;
    return `hace ${Math.floor(secs / 60)}min`;
  })();

  const sortedTrades = [...trades].sort(
    (a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime(),
  );

  const statusDot: Record<typeof wsStatus, string> = {
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    error: 'bg-red-500',
  };

  // ─── render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* ── Header ── */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold text-cyan-400">⬡ CryptoSim</span>
          <nav className="flex items-center gap-1">
            {(
              [
                ['trading', 'Trading', 'cyan'],
                ['compare', 'Comparativa', 'violet'],
                ['research', 'Research', 'violet'],
              ] as const
            ).map(([id, label, color]) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={`text-xs px-3 py-1 rounded transition-colors ${
                  section === id
                    ? `bg-${color}-500/20 text-${color}-400 border border-${color}-500/40`
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {mlModelReady !== null && (
            <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${
              mlModelReady
                ? 'bg-green-900/20 border-green-700/40 text-green-400'
                : 'bg-gray-800/60 border-gray-700 text-gray-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${mlModelReady ? 'bg-green-400' : 'bg-gray-600'}`} />
              {mlModelReady ? 'ML activo' : 'Sin modelo'}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className={`w-2 h-2 rounded-full ${statusDot[wsStatus]}`} />
            <span>{wsStatus === 'connected' ? 'Live' : wsStatus}</span>
            {wsStatus === 'connected' && lastUpdateLabel && (
              <span className="text-gray-600">· {lastUpdateLabel}</span>
            )}
          </div>

          {/* Gear: edits selected preset config if any, otherwise legacy global config */}
          <button
            onClick={() => setConfigOpen(true)}
            title={selectedPreset ? `Configurar: ${selectedPreset.name}` : 'Configuración de trading'}
            className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Config modal: edits the selected preset (or global fallback) ── */}
      {configOpen && (
        <TradingConfigModal
          preset={selectedPreset ?? undefined}
          onClose={() => setConfigOpen(false)}
        />
      )}

      {/* ── Research section ── */}
      {section === 'research' && <ResearchPage />}

      {/* ── Compare section ── */}
      {section === 'compare' && (
        <CompareView onSelectPreset={handleCompareSelectPreset} />
      )}

      {/* ── Trading section ── */}
      <div className={`flex flex-1 overflow-hidden ${section !== 'trading' ? 'hidden' : ''}`}>

        {/* Sidebar */}
        <aside className="w-80 border-r border-gray-800 flex flex-col overflow-hidden flex-shrink-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-5">

            {/* Preset list */}
            <PresetPanel
              selectedPresetId={selectedPresetId}
              onSelectPreset={handleSelectPreset}
            />

            {/* Divider */}
            {selectedPreset && (
              <div className="border-t border-gray-800 pt-4">
                <PortfolioPanel
                  portfolio={portfolio}
                  loading={dataLoading}
                  presetName={selectedPreset.name}
                />
              </div>
            )}
          </div>

          {/* Wallet ID footer */}
          {walletId && (
            <div className="px-4 py-3 border-t border-gray-800 flex-shrink-0">
              <p className="text-[10px] text-gray-700">
                Wallet: <span className="text-gray-600 font-mono">{walletId.slice(0, 8)}…</span>
              </p>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {selectedPreset ? (
            <>
              {/* Chart area */}
              <div className="flex-1 p-4 border-b border-gray-800 overflow-hidden">
                <div className="flex gap-2 mb-3 flex-wrap">
                  {activePairs.map((pair) => (
                    <button
                      key={pair}
                      onClick={() => setSelectedPair(pair)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                        selectedPair === pair
                          ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                          : 'border-gray-700 text-gray-500 hover:border-gray-600'
                      }`}
                    >
                      {pair}
                    </button>
                  ))}
                </div>
                <PriceChart trades={sortedTrades} symbol={selectedPair} />
              </div>

              {/* Trade list */}
              <div className="p-4 flex-shrink-0">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Trades recientes
                  <span className="ml-2 text-gray-700 font-normal">{sortedTrades.length} total</span>
                </h2>
                <TradeList trades={sortedTrades} />
              </div>
            </>
          ) : (
            /* Empty state — no preset selected */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
                <span className="text-3xl">⬡</span>
              </div>
              <div>
                <p className="text-gray-400 text-sm font-medium">Sin preset seleccionado</p>
                <p className="text-gray-700 text-xs mt-1">
                  Crea un preset o selecciona uno de la lista para ver su portfolio y trades.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
