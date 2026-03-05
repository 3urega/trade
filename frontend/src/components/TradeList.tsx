import type { Trade } from '../types/index.ts';

interface Props {
  trades: Trade[];
}

export function TradeList({ trades }: Props) {
  if (trades.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-gray-600 text-sm">
        No trades yet. Simulation will start soon…
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-64">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="text-left py-1.5 px-2">Time</th>
            <th className="text-left py-1.5 px-2">Pair</th>
            <th className="text-left py-1.5 px-2">Type</th>
            <th className="text-right py-1.5 px-2">Amount</th>
            <th className="text-right py-1.5 px-2">Price</th>
            <th className="text-right py-1.5 px-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {trades.slice(0, 30).map(trade => (
            <tr key={trade.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              <td className="py-1 px-2 text-gray-500">
                {new Date(trade.executedAt).toLocaleTimeString()}
              </td>
              <td className="py-1 px-2 text-gray-300">{trade.pair}</td>
              <td className={`py-1 px-2 font-semibold ${trade.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                {trade.type}
              </td>
              <td className="py-1 px-2 text-right tabular-nums text-gray-300">
                {Number(trade.amount).toFixed(6)}
              </td>
              <td className="py-1 px-2 text-right tabular-nums text-gray-300">
                ${Number(trade.price).toFixed(2)}
              </td>
              <td className="py-1 px-2 text-right tabular-nums text-gray-400">
                ${Number(trade.totalCost).toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
