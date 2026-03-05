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

  emitTradeExecuted(trade: TradeResponseDto): void {
    this.server.emit('trade_executed', trade);
  }

  emitPortfolioUpdate(portfolio: PortfolioResponseDto): void {
    this.server.emit('portfolio_update', portfolio);
  }

  emitPriceUpdate(symbol: string, price: number, timestamp: Date): void {
    this.server.emit('price_update', { symbol, price, timestamp });
  }
}
