import { io, Socket } from 'socket.io-client';
import type { Trade, Portfolio, PriceUpdate } from '../types/index.ts';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/trading', {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
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

export function onSocketConnect(cb: () => void): () => void {
  const s = getSocket();
  if (s.connected) cb();
  s.on('connect', cb);
  return () => { s.off('connect', cb); };
}

export function onSocketDisconnect(cb: () => void): () => void {
  getSocket().on('disconnect', cb);
  return () => { getSocket().off('disconnect', cb); };
}
