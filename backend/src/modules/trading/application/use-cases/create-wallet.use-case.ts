import { Inject, Injectable, ConflictException } from '@nestjs/common';
import { UseCase } from '../../../../shared/application/use-case.interface.js';
import type { WalletRepositoryPort } from '../../domain/ports/wallet-repository.port.js';
import { WALLET_REPOSITORY } from '../../domain/ports/wallet-repository.port.js';
import { Wallet } from '../../domain/entities/wallet.entity.js';

export interface CreateWalletRequest {
  ownerId: string;
  initialUsdtBalance?: number;
}

export interface WalletResponseDto {
  walletId: string;
  ownerId: string;
  balances: Record<string, number>;
}

@Injectable()
export class CreateWalletUseCase implements UseCase<CreateWalletRequest, WalletResponseDto> {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
  ) {}

  async execute(request: CreateWalletRequest): Promise<WalletResponseDto> {
    const existing = await this.walletRepo.findByOwnerId(request.ownerId);
    if (existing) {
      throw new ConflictException(`Wallet already exists for owner: ${request.ownerId}`);
    }

    const initialBalance = request.initialUsdtBalance ?? 10000;
    const wallet = Wallet.create(request.ownerId, new Map([['USDT', initialBalance]]));
    await this.walletRepo.save(wallet);

    return {
      walletId: wallet.id.value,
      ownerId: wallet.ownerId,
      balances: Object.fromEntries(wallet.getBalances()),
    };
  }
}
