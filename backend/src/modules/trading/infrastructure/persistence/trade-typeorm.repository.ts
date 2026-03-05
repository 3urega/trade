import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { TradeRepositoryPort } from '../../domain/ports/trade-repository.port.js';
import { Trade } from '../../domain/entities/trade.entity.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { CryptoPair } from '../../domain/value-objects/crypto-pair.js';
import { Money } from '../../domain/value-objects/money.js';
import { TradeType, TradeStatus } from '../../domain/enums.js';
import { TradeOrmEntity } from './trade.orm-entity.js';

@Injectable()
export class TradeTypeOrmRepository implements TradeRepositoryPort {
  constructor(
    @InjectRepository(TradeOrmEntity)
    private readonly repo: Repository<TradeOrmEntity>,
  ) {}

  async save(trade: Trade): Promise<void> {
    await this.repo.save(this.toOrm(trade));
  }

  async findById(id: UniqueEntityId): Promise<Trade | null> {
    const orm = await this.repo.findOne({ where: { id: id.value } });
    return orm ? this.toDomain(orm) : null;
  }

  async findByWalletId(walletId: UniqueEntityId, limit = 50): Promise<Trade[]> {
    const orms = await this.repo.find({
      where: { walletId: walletId.value },
      order: { executedAt: 'DESC' },
      take: limit,
    });
    return orms.map((o) => this.toDomain(o));
  }

  async findAll(limit = 50, offset = 0): Promise<Trade[]> {
    const orms = await this.repo.find({
      order: { executedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return orms.map((o) => this.toDomain(o));
  }

  private toOrm(trade: Trade): TradeOrmEntity {
    const orm = new TradeOrmEntity();
    orm.id = trade.id.value;
    orm.walletId = trade.walletId.value;
    orm.baseCurrency = trade.pair.base;
    orm.quoteCurrency = trade.pair.quote;
    orm.type = trade.type;
    orm.amount = trade.amount;
    orm.price = trade.price.amount;
    orm.fee = trade.fee.amount;
    orm.status = trade.status;
    orm.executedAt = trade.executedAt;
    return orm;
  }

  private toDomain(orm: TradeOrmEntity): Trade {
    const pair = CryptoPair.create(orm.baseCurrency, orm.quoteCurrency);
    const price = Money.create(Number(orm.price), orm.quoteCurrency);
    const id = new UniqueEntityId(orm.id);
    const walletId = new UniqueEntityId(orm.walletId);

    const result = Trade.create(walletId, pair, orm.type as TradeType, Number(orm.amount), price, id);
    if (result.isFailure) throw new Error(`Cannot reconstitute Trade: ${result.getError().message}`);

    const trade = result.getValue();
    // Restore status if different from EXECUTED (e.g. CANCELLED)
    if (orm.status !== TradeStatus.EXECUTED) {
      Object.defineProperty(trade['props'], 'status', { value: orm.status });
    }
    return trade;
  }
}
