import type { Portfolio, BalanceEntry } from '../types/index.ts';

interface Props {
  portfolio: Portfolio | null;
  loading?: boolean;
  /** Optional preset name to show as context label */
  presetName?: string;
}

function CurrencyBar({ entry, total }: { entry: BalanceEntry; total: number }) {
  const pct = total > 0 ? (entry.valueUsdt / total) * 100 : entry.pct;
  const isCash = entry.currency === 'USDT';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-semibold ${isCash ? 'text-gray-300' : 'text-gray-200'}`}>
            {entry.currency}
          </span>
          {!isCash && (
            <span className="text-gray-600 tabular-nums truncate">
              {entry.amount.toFixed(6)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-gray-300 tabular-nums">
            ${entry.valueUsdt.toFixed(2)}
          </span>
          <span className="text-gray-600 w-9 text-right tabular-nums">
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>
      {/* percentage bar */}
      <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isCash ? 'bg-gray-500' : 'bg-cyan-500'
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function PortfolioPanel({ portfolio, loading, presetName }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-28 text-gray-600 text-xs animate-pulse">
        Cargando portfolio…
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="flex items-center justify-center h-28 text-gray-700 text-xs">
        Selecciona un preset para ver su portfolio
      </div>
    );
  }

  const pnlPos = portfolio.pnl >= 0;
  const sign = pnlPos ? '+' : '';
  const visibleBalances = portfolio.balances.filter((b) => b.amount > 0.000001);

  return (
    <div className="space-y-4">
      {presetName && (
        <p className="text-[10px] text-gray-600 uppercase tracking-wider truncate">
          {presetName}
        </p>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-800/60 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Valor Total</p>
          <p className="text-base font-bold text-white tabular-nums">
            ${portfolio.totalValueUsdt.toFixed(2)}
          </p>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">P&amp;L</p>
          <p className={`text-base font-bold tabular-nums ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
            {sign}{portfolio.pnl.toFixed(2)}
          </p>
          <p className={`text-[10px] tabular-nums ${pnlPos ? 'text-green-500' : 'text-red-500'}`}>
            {sign}{portfolio.pnlPercent.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Capital breakdown */}
      {visibleBalances.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
            Desglose de capital
          </p>
          <div className="space-y-2.5">
            {visibleBalances
              .sort((a, b) => b.valueUsdt - a.valueUsdt)
              .map((b) => (
                <CurrencyBar
                  key={b.currency}
                  entry={b}
                  total={portfolio.totalValueUsdt}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
