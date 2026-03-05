import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { WalletRepositoryPort } from '../../domain/ports/wallet-repository.port.js';
import { Wallet } from '../../domain/entities/wallet.entity.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';
import { WalletOrmEntity } from './wallet.orm-entity.js';

@Injectable()
export class WalletTypeOrmRepository implements WalletRepositoryPort {
  constructor(
    @InjectRepository(WalletOrmEntity)
    private readonly repo: Repository<WalletOrmEntity>,
  ) {}

  async save(wallet: Wallet): Promise<void> {
    await this.repo.save(this.toOrm(wallet));
  }

  async findById(id: UniqueEntityId): Promise<Wallet | null> {
    const orm = await this.repo.findOne({ where: { id: id.value } });
    return orm ? this.toDomain(orm) : null;
  }

  async findByOwnerId(ownerId: string): Promise<Wallet | null> {
    const orm = await this.repo.findOne({ where: { ownerId } });
    return orm ? this.toDomain(orm) : null;
  }

  private toOrm(wallet: Wallet): WalletOrmEntity {
    const orm = new WalletOrmEntity();
    orm.id = wallet.id.value;
    orm.ownerId = wallet.ownerId;
    orm.balances = Object.fromEntries(wallet.getBalances());
    orm.createdAt = wallet.createdAt;
    return orm;
  }

  private toDomain(orm: WalletOrmEntity): Wallet {
    return Wallet.reconstitute(
      {
        ownerId: orm.ownerId,
        balances: new Map(Object.entries(orm.balances)),
        createdAt: orm.createdAt,
      },
      new UniqueEntityId(orm.id),
    );
  }
}
