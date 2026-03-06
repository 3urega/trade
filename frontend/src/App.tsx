import { useState, useEffect, useCallback } from 'react';
import { PortfolioPanel } from './components/PortfolioPanel.tsx';
import { PriceChart } from './components/PriceChart.tsx';
import { TradeList } from './components/TradeList.tsx';
import { ResearchPage } from './components/research/ResearchPage.tsx';
import { TradingConfigModal } from './components/TradingConfigModal.tsx';
import { fetchTrades, fetchPortfolio, fetchSignalStatus, fetchSimulationWallet } from './services/api.ts';
import { onTradeExecuted, onPortfolioUpdate, onSocketConnect, onSocketDisconnect } from './services/socket.ts';
import type { Trade, Portfolio } from './types/index.ts';

type AppSection = 'trading' | 'research';

const SIMULATION_WALLET_ID_KEY = 'sim_wallet_id';

const PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];

export default function App() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState('SOL/USDT');
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [section, setSection] = useState<AppSection>('trading');
  const [mlModelReady, setMlModelReady] = useState<boolean | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const loadData = useCallback(async (wid: string) => {
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
      setLoading(false);
    }
  }, []);

  // Discover the simulation wallet — validate cached ID, fallback to polling backend
  useEffect(() => {
    let cancelled = false;

    const startPolling = () => {
      const poll = setInterval(async () => {
        if (cancelled) { clearInterval(poll); return; }
        try {
          const { walletId: wid } = await fetchSimulationWallet();
          if (wid) {
            localStorage.setItem(SIMULATION_WALLET_ID_KEY, wid);
            setWalletId(wid);
            clearInterval(poll);
            void loadData(wid);
          }
        } catch { /* backend not ready yet */ }
      }, 2000);
      return poll;
    };

    const stored = localStorage.getItem(SIMULATION_WALLET_ID_KEY);
    if (stored) {
      // Validate stored ID is still valid before using it
      fetchPortfolio(stored)
        .then((p) => {
          if (cancelled) return;
          setWalletId(stored);
          setPortfolio(p);
          void fetchTrades(stored, 100).then(setTrades).catch(() => null);
          setLoading(false);
        })
        .catch(() => {
          // Wallet no longer exists — clear cache and re-discover
          localStorage.removeItem(SIMULATION_WALLET_ID_KEY);
          if (!cancelled) startPolling();
        });
    } else {
      startPolling();
    }

    return () => { cancelled = true; };
  }, [loadData]);

  // WebSocket: connection status
  useEffect(() => {
    const offConnect = onSocketConnect(() => setWsStatus('connected'));
    const offDisconnect = onSocketDisconnect(() => setWsStatus('error'));
    return () => { offConnect(); offDisconnect(); };
  }, []);

  // WebSocket: new trades (solo del wallet actual)
  useEffect(() => {
    const off = onTradeExecuted((trade) => {
      if (walletId && trade.walletId === walletId) {
        setTrades(prev => [trade, ...prev].slice(0, 200));
      }
    });
    return off;
  }, [walletId]);

  // WebSocket: portfolio update (balances + P&L en tiempo real)
  useEffect(() => {
    const off = onPortfolioUpdate((portfolio) => {
      if (walletId && portfolio.walletId === walletId) {
        setPortfolio(portfolio);
      }
    });
    return off;
  }, [walletId]);

  // Poll ML model status every 10 seconds
  useEffect(() => {
    const check = () => {
      void fetchSignalStatus().then((s) => setMlModelReady(s.modelReady));
    };
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  const allTrades = [...trades].sort(
    (a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime(),
  );

  const statusDot: Record<typeof wsStatus, string> = {
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    error: 'bg-red-500',
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold text-cyan-400">⬡ CryptoSim</span>
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setSection('trading')}
              className={`text-xs px-3 py-1 rounded transition-colors ${
                section === 'trading'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Trading
            </button>
            <button
              onClick={() => setSection('research')}
              className={`text-xs px-3 py-1 rounded transition-colors ${
                section === 'research'
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Research
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {mlModelReady !== null && (
            <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${
              mlModelReady
                ? 'bg-green-900/20 border-green-700/40 text-green-400'
                : 'bg-gray-800/60 border-gray-700 text-gray-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${mlModelReady ? 'bg-green-400' : 'bg-gray-600'}`} />
              {mlModelReady ? 'ML model active' : 'No ML model'}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className={`w-2 h-2 rounded-full ${statusDot[wsStatus]}`} />
            <span>{wsStatus === 'connected' ? 'Live' : wsStatus}</span>
          </div>
          <button
            onClick={() => setConfigOpen(true)}
            title="Configuración de trading"
            className="p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {configOpen && <TradingConfigModal onClose={() => setConfigOpen(false)} />}

      {section === 'research' && <ResearchPage />}

      <div className={`flex flex-1 overflow-hidden ${section !== 'trading' ? 'hidden' : ''}`}>
        {/* Sidebar */}
        <aside className="w-72 border-r border-gray-800 p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Portfolio</h2>
            <PortfolioPanel portfolio={portfolio} loading={loading} />
          </div>

          {walletId && (
            <div className="mt-auto pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-600 break-all">
                Wallet: <span className="text-gray-500">{walletId.slice(0, 8)}…</span>
              </p>
            </div>
          )}
        </aside>

        {/* Main area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Chart area */}
          <div className="flex-1 p-4 border-b border-gray-800">
            <div className="flex gap-2 mb-3">
              {PAIRS.map(pair => (
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
            <PriceChart trades={allTrades} symbol={selectedPair} />
          </div>

          {/* Trade list */}
          <div className="p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Recent Trades
              <span className="ml-2 text-gray-700 font-normal">{allTrades.length} total</span>
            </h2>
            <TradeList trades={allTrades} />
          </div>
        </main>
      </div>
    </div>
  );
}
