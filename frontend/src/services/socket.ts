import { io, Socket } from 'socket.io-client';
import type { Trade, Portfolio, PriceUpdate, PresetStateChange } from '../types/index.ts';

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

/**
 * Listen for trade execution events.
 * The payload now includes an optional `presetId` when the trade originated
 * from a specific preset's simulation runner.
 */
export function onTradeExecuted(cb: (trade: Trade) => void): () => void {
  getSocket().on('trade_executed', cb);
  return () => { getSocket().off('trade_executed', cb); };
}

/**
 * Listen for portfolio update events.
 * The payload now includes an optional `presetId` when the update originated
 * from a specific preset's simulation runner.
 */
export function onPortfolioUpdate(cb: (portfolio: Portfolio) => void): () => void {
  getSocket().on('portfolio_update', cb);
  return () => { getSocket().off('portfolio_update', cb); };
}

export function onPriceUpdate(cb: (update: PriceUpdate) => void): () => void {
  getSocket().on('price_update', cb);
  return () => { getSocket().off('price_update', cb); };
}

/**
 * Listen for preset lifecycle changes (activated, paused, archived, config_updated).
 * Use this to reactively refresh the preset list or update per-preset state.
 */
export function onPresetStateChange(cb: (payload: PresetStateChange) => void): () => void {
  getSocket().on('preset_state_change', cb);
  return () => { getSocket().off('preset_state_change', cb); };
}

/** Notify the server that this client is interested in a specific preset's events. */
export function subscribePreset(presetId: string): void {
  getSocket().emit('subscribe_preset', presetId);
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
