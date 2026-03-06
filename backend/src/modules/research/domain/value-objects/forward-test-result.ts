export interface SimTrade {
  type: 'BUY' | 'SELL';
  price: number;
  qty: number;
  fee: number;
  pnl: number;
  time: Date;
  reason: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'END_OF_TEST';
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
  slMultiplier: number;
  tpMultiplier: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  lastVolatility: number;
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
  profitFactor: number;
  avgTrade: number;
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
    slMultiplier = 2,
    tpMultiplier = 3,
  ): TradingSimulation {
    return new TradingSimulation({
      initialCapital,
      cash: initialCapital,
      positionQty: 0,
      positionEntryPrice: 0,
      feeRate,
      signalThreshold,
      positionSizePct,
      slMultiplier,
      tpMultiplier,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      lastVolatility: 0,
      trades: [],
      equityCurve: [],
      peakEquity: initialCapital,
      maxDrawdown: 0,
    });
  }

  setVolatility(vol: number): void {
    this.state.lastVolatility = vol;
  }

  processTick(predictedLogReturn: number, currentPrice: number, time: Date): void {
    const s = this.state;

    // Check SL/TP before evaluating signal
    if (s.positionQty > 0 && s.stopLossPrice > 0) {
      if (currentPrice <= s.stopLossPrice) {
        this.closePositionWith(currentPrice, time, 'STOP_LOSS');
        this.updateEquity(currentPrice, time);
        return;
      } else if (currentPrice >= s.takeProfitPrice) {
        this.closePositionWith(currentPrice, time, 'TAKE_PROFIT');
        this.updateEquity(currentPrice, time);
        return;
      }
    }

    if (predictedLogReturn > s.signalThreshold && s.positionQty === 0) {
      const confidence = Math.min(Math.abs(predictedLogReturn) / s.signalThreshold, 1);
      const investAmount = s.cash * s.positionSizePct * confidence;
      const fee = investAmount * s.feeRate;
      const netInvest = investAmount - fee;
      const qty = netInvest / currentPrice;

      s.positionQty = qty;
      s.positionEntryPrice = currentPrice;
      s.cash -= investAmount;
      s.stopLossPrice = currentPrice - (s.slMultiplier * s.lastVolatility * currentPrice);
      s.takeProfitPrice = currentPrice + (s.tpMultiplier * s.lastVolatility * currentPrice);
      s.trades.push({ type: 'BUY', price: currentPrice, qty, fee, pnl: 0, time, reason: 'SIGNAL' });
    } else if (predictedLogReturn < -s.signalThreshold && s.positionQty > 0) {
      this.closePositionWith(currentPrice, time, 'SIGNAL');
    }

    this.updateEquity(currentPrice, time);
  }

  private closePositionWith(price: number, time: Date, reason: SimTrade['reason']): void {
    const s = this.state;
    const grossValue = s.positionQty * price;
    const fee = grossValue * s.feeRate;
    const netValue = grossValue - fee;
    const costBasis = s.positionQty * s.positionEntryPrice;
    const pnl = netValue - costBasis;

    s.cash += netValue;
    s.trades.push({ type: 'SELL', price, qty: s.positionQty, fee, pnl, time, reason });
    s.positionQty = 0;
    s.positionEntryPrice = 0;
    s.stopLossPrice = 0;
    s.takeProfitPrice = 0;
  }

  private updateEquity(currentPrice: number, time: Date): void {
    const s = this.state;
    const equity = s.cash + s.positionQty * currentPrice;
    s.equityCurve.push({ time, equity });
    if (equity > s.peakEquity) s.peakEquity = equity;
    const drawdown = s.peakEquity - equity;
    if (drawdown > s.maxDrawdown) s.maxDrawdown = drawdown;
  }

  closeOpenPosition(currentPrice: number, time: Date): void {
    if (this.state.positionQty <= 0) return;
    this.closePositionWith(currentPrice, time, 'END_OF_TEST');
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

    const grossProfit = sellTrades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(sellTrades.filter((t) => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    const avgTrade = sellTrades.length > 0 ? totalPnl / sellTrades.length : 0;

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
      profitFactor,
      avgTrade,
      trades: [...s.trades],
      equityCurve: [...s.equityCurve],
    };
  }
}
