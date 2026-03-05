import { Wallet } from '../entities/wallet.entity.js';
import { UniqueEntityId } from '../../../../shared/domain/unique-entity-id.js';

export interface WalletRepositoryPort {
  save(wallet: Wallet): Promise<void>;
  findById(id: UniqueEntityId): Promise<Wallet | null>;
  findByOwnerId(ownerId: string): Promise<Wallet | null>;
}

export const WALLET_REPOSITORY = Symbol('WALLET_REPOSITORY');
