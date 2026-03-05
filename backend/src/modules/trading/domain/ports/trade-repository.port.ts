import { Trade } from '../entities/trade.entity.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';

export interface TradeRepositoryPort {
  save(trade: Trade): Promise<void>;
  findById(id: UniqueEntityId): Promise<Trade | null>;
  findByWalletId(walletId: UniqueEntityId, limit?: number): Promise<Trade[]>;
  findAll(limit?: number, offset?: number): Promise<Trade[]>;
}

export const TRADE_REPOSITORY = Symbol('TRADE_REPOSITORY');
