export type Currency = 'EUR' | 'USD' | 'GBP';

export interface Account {
  id: string;
  balance: number;
  currency: Currency;
  dailyTransferredAmount: number;
}

export interface Transfer {
  fromAccount: Account;
  toIBAN: string;
  amount: number;
  currency: Currency;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const DAILY_LIMIT = 10_000;
const MIN_TRANSFER = 0.01;
const MAX_TRANSFER = 50_000;

const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}$/;

export function validateIBAN(iban: string): boolean {
  if (!iban || typeof iban !== 'string') return false;
  const normalized = iban.replace(/\s/g, '').toUpperCase();
  return IBAN_REGEX.test(normalized);
}

export function validateAmount(amount: number): boolean {
  return amount >= MIN_TRANSFER && amount <= MAX_TRANSFER;
}

export function hasSufficientBalance(account: Account, amount: number): boolean {
  return account.balance >= amount;
}

export function exceedsDailyLimit(account: Account, amount: number): boolean {
  return account.dailyTransferredAmount + amount > DAILY_LIMIT;
}

export function isSameCurrency(account: Account, currency: Currency): boolean {
  return account.currency === currency;
}

export function validateTransfer(transfer: Transfer): ValidationResult {
  const errors: string[] = [];

  if (!validateIBAN(transfer.toIBAN)) {
    errors.push('IBAN inválido');
  }

  if (!validateAmount(transfer.amount)) {
    if (transfer.amount < MIN_TRANSFER) {
      errors.push(`El importe mínimo es ${MIN_TRANSFER} €`);
    } else {
      errors.push(`El importe máximo es ${MAX_TRANSFER} €`);
    }
  }

  if (!hasSufficientBalance(transfer.fromAccount, transfer.amount)) {
    errors.push('Saldo insuficiente');
  }

  if (exceedsDailyLimit(transfer.fromAccount, transfer.amount)) {
    errors.push(`Límite diario de ${DAILY_LIMIT} € superado`);
  }

  if (!isSameCurrency(transfer.fromAccount, transfer.currency)) {
    errors.push('La moneda de la transferencia no coincide con la cuenta de origen');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
