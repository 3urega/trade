export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class InsufficientFundsError extends DomainError {
  constructor(required: number, available: number, currency: string) {
    super(
      'INSUFFICIENT_FUNDS',
      `Insufficient ${currency}: required ${required}, available ${available}`,
    );
  }
}

export class InvalidTradeAmountError extends DomainError {
  constructor(amount: number) {
    super('INVALID_TRADE_AMOUNT', `Trade amount must be positive, got: ${amount}`);
  }
}

export class InvalidPriceError extends DomainError {
  constructor(price: number) {
    super('INVALID_PRICE', `Price must be positive, got: ${price}`);
  }
}

export class WalletNotFoundError extends DomainError {
  constructor(walletId: string) {
    super('WALLET_NOT_FOUND', `Wallet not found: ${walletId}`);
  }
}
