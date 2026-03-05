export class Result<T, E = string> {
  private readonly _isSuccess: boolean;
  private readonly _value?: T;
  private readonly _error?: E;

  private constructor(isSuccess: boolean, value?: T, error?: E) {
    this._isSuccess = isSuccess;
    this._value = value;
    this._error = error;
    Object.freeze(this);
  }

  get isSuccess(): boolean {
    return this._isSuccess;
  }

  get isFailure(): boolean {
    return !this._isSuccess;
  }

  getValue(): T {
    if (!this._isSuccess) {
      throw new Error('Cannot get value of a failed Result. Check isSuccess first.');
    }
    return this._value as T;
  }

  getError(): E {
    if (this._isSuccess) {
      throw new Error('Cannot get error of a successful Result.');
    }
    return this._error as E;
  }

  static ok<T, E = string>(value?: T): Result<T, E> {
    return new Result<T, E>(true, value);
  }

  static fail<T, E = string>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  static combine<E = string>(results: Result<unknown, E>[]): Result<void, E> {
    const failed = results.find((r) => r.isFailure);
    if (failed) return Result.fail<void, E>(failed.getError());
    return Result.ok<void, E>();
  }
}
