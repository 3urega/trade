import { io, Socket } from 'socket.io-client';
import type { Trade, Portfolio, PriceUpdate } from '../types/index.ts';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${BACKEND_URL}/trading`, {
      transports: ['websocket'],
      autoConnect: true,
    });
  }
  return socket;
}

export function onTradeExecuted(cb: (trade: Trade) => void): () => void {
  getSocket().on('trade_executed', cb);
  return () => { getSocket().off('trade_executed', cb); };
}

export function onPortfolioUpdate(cb: (portfolio: Portfolio) => void): () => void {
  getSocket().on('portfolio_update', cb);
  return () => { getSocket().off('portfolio_update', cb); };
}

export function onPriceUpdate(cb: (update: PriceUpdate) => void): () => void {
  getSocket().on('price_update', cb);
  return () => { getSocket().off('price_update', cb); };
}
