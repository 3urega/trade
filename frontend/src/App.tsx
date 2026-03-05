import { useState, useEffect, useCallback } from 'react';
import { PortfolioPanel } from './components/PortfolioPanel.tsx';
import { PriceChart } from './components/PriceChart.tsx';
import { TradeList } from './components/TradeList.tsx';
import { ResearchPage } from './components/research/ResearchPage.tsx';
import { fetchTrades, fetchPortfolio } from './services/api.ts';
import { onTradeExecuted, onPortfolioUpdate } from './services/socket.ts';
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

  // Discover the simulation wallet via first trade
  useEffect(() => {
    const stored = localStorage.getItem(SIMULATION_WALLET_ID_KEY);
    if (stored) {
      setWalletId(stored);
      void loadData(stored);
      return;
    }

    // Poll until simulation creates the first trade
    const poll = setInterval(async () => {
      try {
        const initial = await fetchTrades(undefined, 1);
        if (initial.length > 0) {
          const wid = initial[0].walletId;
          localStorage.setItem(SIMULATION_WALLET_ID_KEY, wid);
          setWalletId(wid);
          clearInterval(poll);
          void loadData(wid);
        }
      } catch { /* backend not ready yet */ }
    }, 2000);

    return () => clearInterval(poll);
  }, [loadData]);

  // WebSocket: new trades (solo del wallet actual)
  useEffect(() => {
    const off = onTradeExecuted((trade) => {
      setWsStatus('connected');
      if (walletId && trade.walletId === walletId) {
        setTrades(prev => [trade, ...prev].slice(0, 200));
      }
    });
    return off;
  }, [walletId]);

  // WebSocket: portfolio update (balances + P&L en tiempo real)
  useEffect(() => {
    const off = onPortfolioUpdate((portfolio) => {
      setWsStatus('connected');
      if (walletId && portfolio.walletId === walletId) {
        setPortfolio(portfolio);
      }
    });
    return off;
  }, [walletId]);

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
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className={`w-2 h-2 rounded-full ${statusDot[wsStatus]}`} />
          <span>{wsStatus === 'connected' ? 'Live' : wsStatus}</span>
        </div>
      </header>

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
