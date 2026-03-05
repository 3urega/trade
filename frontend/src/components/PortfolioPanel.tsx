import type { Portfolio } from '../types/index.ts';

interface Props {
  portfolio: Portfolio | null;
  loading: boolean;
}

export function PortfolioPanel({ portfolio, loading }: Props) {
  if (loading) return (
    <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
      Loading portfolio…
    </div>
  );

  if (!portfolio) return null;

  const pnlColor = portfolio.pnl >= 0 ? 'text-green-400' : 'text-red-400';
  const pnlSign = portfolio.pnl >= 0 ? '+' : '';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Total Value</p>
          <p className="text-lg font-bold text-white">
            ${portfolio.totalValueUsdt.toFixed(2)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">P&amp;L</p>
          <p className={`text-lg font-bold ${pnlColor}`}>
            {pnlSign}{portfolio.pnl.toFixed(2)}
            <span className="text-xs ml-1">({pnlSign}{portfolio.pnlPercent.toFixed(2)}%)</span>
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Balances</p>
        <div className="space-y-1">
          {portfolio.balances
            .filter(b => b.amount > 0.000001)
            .map(b => (
              <div key={b.currency} className="flex justify-between items-center bg-gray-800/50 rounded px-3 py-1.5">
                <span className="text-sm font-medium text-gray-200">{b.currency}</span>
                <span className="text-sm text-gray-300 tabular-nums">
                  {b.currency === 'USDT'
                    ? b.amount.toFixed(2)
                    : b.amount.toFixed(6)
                  }
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
