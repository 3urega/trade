export interface SimTrade {
  type: 'BUY' | 'SELL';
  price: number;
  qty: number;
  fee: number;
  pnl: number;
  time: Date;
}

export interface EquityPoint {
  time: Date;
  equity: number;
}

interface TradingSimulationState {
  initialCapital: number;
  cash: number;
  positionQty: number;
  positionEntryPrice: number;
  feeRate: number;
  signalThreshold: number;
  positionSizePct: number;
  trades: SimTrade[];
  equityCurve: EquityPoint[];
  peakEquity: number;
  maxDrawdown: number;
}

export interface TradingMetrics {
  initialCapital: number;
  finalCapital: number;
  totalPnl: number;
  totalPnlPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  trades: SimTrade[];
  equityCurve: EquityPoint[];
}

/**
 * Mutable simulation state — does NOT extend ValueObject because it must
 * update positionQty, cash, trades, etc. during processTick/closeOpenPosition.
 */
export class TradingSimulation {
  private readonly state: TradingSimulationState;

  private constructor(state: TradingSimulationState) {
    this.state = state;
  }

  static create(
    initialCapital: number,
    feeRate = 0.001,
    signalThreshold = 0.0005,
    positionSizePct = 0.5,
  ): TradingSimulation {
    return new TradingSimulation({
      initialCapital,
      cash: initialCapital,
      positionQty: 0,
      positionEntryPrice: 0,
      feeRate,
      signalThreshold,
      positionSizePct,
      trades: [],
      equityCurve: [],
      peakEquity: initialCapital,
      maxDrawdown: 0,
    });
  }

  processTick(predictedLogReturn: number, currentPrice: number, time: Date): void {
    const s = this.state;

    if (predictedLogReturn > s.signalThreshold && s.positionQty === 0) {
      const investAmount = s.cash * s.positionSizePct;
      const fee = investAmount * s.feeRate;
      const netInvest = investAmount - fee;
      const qty = netInvest / currentPrice;

      s.positionQty = qty;
      s.positionEntryPrice = currentPrice;
      s.cash -= investAmount;
      s.trades.push({ type: 'BUY', price: currentPrice, qty, fee, pnl: 0, time });
    } else if (predictedLogReturn < -s.signalThreshold && s.positionQty > 0) {
      const grossValue = s.positionQty * currentPrice;
      const fee = grossValue * s.feeRate;
      const netValue = grossValue - fee;
      const costBasis = s.positionQty * s.positionEntryPrice;
      const pnl = netValue - costBasis;

      s.cash += netValue;
      s.trades.push({ type: 'SELL', price: currentPrice, qty: s.positionQty, fee, pnl, time });
      s.positionQty = 0;
      s.positionEntryPrice = 0;
    }

    const equity = s.cash + s.positionQty * currentPrice;
    s.equityCurve.push({ time, equity });

    if (equity > s.peakEquity) s.peakEquity = equity;
    const drawdown = s.peakEquity - equity;
    if (drawdown > s.maxDrawdown) s.maxDrawdown = drawdown;
  }

  closeOpenPosition(currentPrice: number, time: Date): void {
    const s = this.state;
    if (s.positionQty <= 0) return;

    const grossValue = s.positionQty * currentPrice;
    const fee = grossValue * s.feeRate;
    const netValue = grossValue - fee;
    const costBasis = s.positionQty * s.positionEntryPrice;
    const pnl = netValue - costBasis;

    s.cash += netValue;
    s.trades.push({ type: 'SELL', price: currentPrice, qty: s.positionQty, fee, pnl, time });
    s.positionQty = 0;
    s.positionEntryPrice = 0;
  }

  getMetrics(): TradingMetrics {
    const s = this.state;
    const finalCapital = s.cash + s.positionQty * (s.positionEntryPrice || 0);
    const totalPnl = finalCapital - s.initialCapital;
    const totalPnlPercent = (totalPnl / s.initialCapital) * 100;

    const sellTrades = s.trades.filter((t) => t.type === 'SELL');
    const winningTrades = sellTrades.filter((t) => t.pnl > 0).length;
    const losingTrades = sellTrades.filter((t) => t.pnl <= 0).length;
    const winRate = sellTrades.length > 0 ? (winningTrades / sellTrades.length) * 100 : 0;

    const maxDrawdownPercent = s.peakEquity > 0 ? (s.maxDrawdown / s.peakEquity) * 100 : 0;

    const tradePnls = sellTrades.map((t) => t.pnl);
    let sharpeRatio = 0;
    if (tradePnls.length >= 2) {
      const mean = tradePnls.reduce((a, b) => a + b, 0) / tradePnls.length;
      const variance = tradePnls.reduce((sum, v) => sum + (v - mean) ** 2, 0) / tradePnls.length;
      const std = Math.sqrt(variance);
      if (std > 0) sharpeRatio = mean / std;
    }

    return {
      initialCapital: s.initialCapital,
      finalCapital,
      totalPnl,
      totalPnlPercent,
      totalTrades: s.trades.length,
      winningTrades,
      losingTrades,
      winRate,
      maxDrawdown: s.maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio,
      trades: [...s.trades],
      equityCurve: [...s.equityCurve],
    };
  }
}
