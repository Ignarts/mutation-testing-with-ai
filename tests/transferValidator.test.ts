import {
  validateIBAN,
  validateAmount,
  hasSufficientBalance,
  exceedsDailyLimit,
  isSameCurrency,
  validateTransfer,
  Account,
  Transfer,
} from '../src/transferValidator';

const baseAccount: Account = {
  id: 'ACC-001',
  balance: 5000,
  currency: 'EUR',
  dailyTransferredAmount: 0,
};

const validTransfer: Transfer = {
  fromAccount: baseAccount,
  toIBAN: 'ES7620770024003102575766',
  amount: 100,
  currency: 'EUR',
};

// ─── validateIBAN ────────────────────────────────────────────────────────────

describe('validateIBAN', () => {
  it('acepta un IBAN español válido', () => {
    expect(validateIBAN('ES7620770024003102575766')).toBe(true);
  });

  it('acepta un IBAN con espacios', () => {
    expect(validateIBAN('ES76 2077 0024 0031 0257 5766')).toBe(true);
  });

  it('rechaza una cadena vacía', () => {
    expect(validateIBAN('')).toBe(false);
  });

  it('acepta un IBAN en minúsculas (normaliza a mayúsculas internamente)', () => {
    expect(validateIBAN('es7620770024003102575766')).toBe(true);
  });

  it('rechaza un valor que no es string', () => {
    expect(validateIBAN(null as unknown as string)).toBe(false);
  });
});

// ─── validateAmount ──────────────────────────────────────────────────────────

describe('validateAmount', () => {
  it('acepta un importe normal', () => {
    expect(validateAmount(500)).toBe(true);
  });

  it('rechaza importe negativo', () => {
    expect(validateAmount(-1)).toBe(false);
  });

  it('rechaza cero', () => {
    expect(validateAmount(0)).toBe(false);
  });

  it('rechaza importe mayor que el máximo', () => {
    expect(validateAmount(100_000)).toBe(false);
  });
});

// ─── hasSufficientBalance ────────────────────────────────────────────────────

describe('hasSufficientBalance', () => {
  it('devuelve true cuando el saldo es mayor que el importe', () => {
    expect(hasSufficientBalance(baseAccount, 100)).toBe(true);
  });

  it('devuelve false cuando el saldo es insuficiente', () => {
    expect(hasSufficientBalance(baseAccount, 9999)).toBe(false);
  });
});

// ─── exceedsDailyLimit ───────────────────────────────────────────────────────

describe('exceedsDailyLimit', () => {
  it('devuelve false cuando no supera el límite diario', () => {
    expect(exceedsDailyLimit(baseAccount, 100)).toBe(false);
  });

  it('devuelve true cuando supera el límite diario', () => {
    const account: Account = { ...baseAccount, dailyTransferredAmount: 9500 };
    expect(exceedsDailyLimit(account, 1000)).toBe(true);
  });
});

// ─── isSameCurrency ──────────────────────────────────────────────────────────

describe('isSameCurrency', () => {
  it('devuelve true cuando las monedas coinciden', () => {
    expect(isSameCurrency(baseAccount, 'EUR')).toBe(true);
  });

  it('devuelve false cuando las monedas no coinciden', () => {
    expect(isSameCurrency(baseAccount, 'USD')).toBe(false);
  });
});

// ─── validateTransfer ────────────────────────────────────────────────────────

describe('validateTransfer', () => {
  it('aprueba una transferencia válida', () => {
    const result = validateTransfer(validTransfer);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rechaza IBAN inválido', () => {
    const result = validateTransfer({ ...validTransfer, toIBAN: 'INVALIDO' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('IBAN inválido');
  });

  it('rechaza importe inválido', () => {
    const result = validateTransfer({ ...validTransfer, amount: 0 });
    expect(result.valid).toBe(false);
  });

  it('rechaza saldo insuficiente', () => {
    const result = validateTransfer({ ...validTransfer, amount: 9999 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Saldo insuficiente');
  });

  it('rechaza moneda incorrecta', () => {
    const result = validateTransfer({ ...validTransfer, currency: 'USD' });
    expect(result.valid).toBe(false);
  });

  it('acumula múltiples errores', () => {
    const result = validateTransfer({
      ...validTransfer,
      toIBAN: 'INVALIDO',
      amount: 0,
    });
    expect(result.errors.length).toBeGreaterThan(1);
  });
});
