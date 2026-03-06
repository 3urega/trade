import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TradeResponseDto } from '../../application/dtos/trade-response.dto.js';
import type { PortfolioResponseDto } from '../../application/dtos/portfolio-response.dto.js';

export type PresetStatus = 'active' | 'paused' | 'archived';

export interface PresetStateChangePayload {
  presetId: string;
  name: string;
  status: PresetStatus;
  /** Additional context: 'config_updated' when only config changed without status transition */
  event: 'activated' | 'paused' | 'archived' | 'config_updated';
  timestamp: string;
}

@WebSocketGateway({
  cors: { origin: '*', credentials: false },
  namespace: '/trading',
})
export class TradingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TradingGateway.name);

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
    client.emit('connected', { message: 'Connected to Crypto Trading Simulator' });
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe_wallet')
  handleSubscribeWallet(@MessageBody() walletId: string): void {
    this.logger.debug(`Client subscribed to wallet: ${walletId}`);
  }

  @SubscribeMessage('subscribe_preset')
  handleSubscribePreset(@MessageBody() presetId: string): void {
    this.logger.debug(`Client subscribed to preset: ${presetId}`);
  }

  /**
   * Emits a trade execution event.
   * When presetId is provided the payload includes it so clients can filter by preset.
   */
  emitTradeExecuted(trade: TradeResponseDto, presetId?: string): void {
    const payload = presetId ? { ...trade, presetId } : trade;
    this.server.emit('trade_executed', payload);
  }

  /**
   * Emits a portfolio update event.
   * When presetId is provided the payload includes it so clients can filter by preset.
   */
  emitPortfolioUpdate(portfolio: PortfolioResponseDto, presetId?: string): void {
    const payload = presetId ? { ...portfolio, presetId } : portfolio;
    this.server.emit('portfolio_update', payload);
  }

  /** Emits a real-time price tick. Price updates are pair-scoped, not preset-scoped. */
  emitPriceUpdate(symbol: string, price: number, timestamp: Date): void {
    this.server.emit('price_update', { symbol, price, timestamp });
  }

  /**
   * Emits whenever a preset's lifecycle status changes or its config is updated.
   * Frontend can use this to refresh the preset list or react to paused/archived states.
   */
  emitPresetStateChange(payload: PresetStateChangePayload): void {
    this.server.emit('preset_state_change', payload);
    this.logger.debug(
      `preset_state_change: ${payload.presetId} → ${payload.event}`,
    );
  }
}
