// ─────────────────────────────────────────────────────────────────────────────
// Tests generados para matar los mutantes supervivientes de Stryker
// Cada test está etiquetado con el ID del mutante que mata y el motivo.
// ─────────────────────────────────────────────────────────────────────────────

import {
  validateIBAN,
  validateAmount,
  hasSufficientBalance,
  exceedsDailyLimit,
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

describe('Mutant killers', () => {

  // ── Regex #0: ancla ^ eliminada ───────────────────────────────────────────
  // Sin ^, el motor busca el patrón en cualquier posición de la cadena.
  // "XXXES762..." — sin ^ encuentra el IBAN en la posición 3 y lo acepta.
  // Con ^ solo intenta desde el inicio: XX→\d{2} falla.

  it('#0 rechaza un string con prefijo no-IBAN antes del patrón (mata mutante sin ^)', () => {
    expect(validateIBAN('XXXES7620770024003102575766')).toBe(false);
  });

  // ── Regex #1: ancla $ eliminada ───────────────────────────────────────────
  // El sufijo ([A-Z0-9]?){0,16} solo acepta alfanuméricos opcionalmente.
  // Con $, "ES...766!!" falla porque ! no es consumido y $ no puede cerrar.
  // Sin $, el motor ignora los chars sobrantes y acepta el match parcial.

  it('#1 rechaza un IBAN con caracteres especiales al final (mata mutante sin $)', () => {
    expect(validateIBAN('ES7620770024003102575766!!')).toBe(false);
  });

  // ── Regex #4: \d{2} → \d (dígitos de control reducidos de 2 a 1) ─────────
  // IBAN real: ES + 76(check) + 2077(banco) + 0024003102575766(cuenta)
  // Con \d{2}: "ES7A..." falla porque A en posición 4 no es dígito.
  // Con \d:    "7" satisface \d, luego "A207"→[A-Z0-9]{4}, el resto encaja.

  it('#4 rechaza un IBAN con letra en el segundo dígito de control (mata mutante \d{2}→\d)', () => {
    expect(validateIBAN('ES7A20770024003102575766')).toBe(false);
  });

  // ── Regex #6: [A-Z0-9]{4} → [A-Z0-9] (código banco de 4 a 1 char) ───────
  // Original: ABCD como código banco (4 chars) ✓; después 0024003 como \d{7} ✓
  // Mutante:  solo "A" como código banco; luego \d{7} espera dígitos pero ve "BCD..." → FALLA
  // El test lo afirma como válido: pasa con original, falla con el mutante → mutante muere.

  it('#6 acepta IBAN con código banco alfabético de 4 chars (mata mutante {4}→{1})', () => {
    expect(validateIBAN('ES76ABCD0024003102575766')).toBe(true);
  });

  // ── Regex #8: \d{7} → \d (parte numérica de 7 a 1 dígito) ───────────────
  // Con \d{7}: "1XXXXXXX" falla porque X no es dígito tras el primero.
  // Con \d:    "1" satisface \d; "XXXXXXXXXXXXX" encaja como sufijo alfanumérico.

  it('#8 rechaza un IBAN con solo 1 dígito en la sección numérica central (mata mutante \d{7}→\d)', () => {
    expect(validateIBAN('ES76ABCD1XXXXXXXXXXXXX')).toBe(false);
  });

  // ── Regex #11: ([A-Z0-9]?) → ([A-Z0-9]) (? eliminado del sufijo) ─────────
  // La diferencia práctica es mínima; este mutante probablemente es equivalente.
  // El test confirma que un IBAN estándar sin sufijo sigue siendo válido.

  it('#11 acepta un IBAN español estándar sin sufijo opcional', () => {
    expect(validateIBAN('ES7620770024003102575766')).toBe(true);
  });

  // ── LogicalOperator #16: || → && en guardia null-check ───────────────────
  // Original: if (!iban || typeof iban !== 'string') → devuelve false si cualquiera falla
  // Mutante:  if (!iban && typeof iban !== 'string') → solo devuelve false si LOS DOS fallan
  //
  // Con un número (42): !42=false, typeof 42!=='string'=true
  //   Original (||): false || true = true → return false (seguro)
  //   Mutante  (&&): false && true = false → no return → intenta (42).replace(...) → TypeError
  //
  // El test pide que NO lance excepción: pasa con original, falla con mutante → mutante muere.

  it('#16 devuelve false para un número sin lanzar excepción (mata mutante ||→&&)', () => {
    expect(() => validateIBAN(42 as unknown as string)).not.toThrow();
    expect(validateIBAN(42 as unknown as string)).toBe(false);
  });

  // ── ConditionalExpression #18: condición guardia → false siempre ──────────
  // Si la guardia siempre devuelve false, null entraría al regex y lanzaría error.
  // El test verifica que null devuelve false sin lanzar excepción.

  it('#18 devuelve false para null sin lanzar excepción', () => {
    expect(() => validateIBAN(null as unknown as string)).not.toThrow();
    expect(validateIBAN(null as unknown as string)).toBe(false);
  });

  // ── EqualityOperator #30: amount >= MIN → amount > MIN ───────────────────
  // Con >: el valor exacto 0.01 sería rechazado (falso negativo).
  // El test verifica que el mínimo exacto se acepta.

  it('#30 acepta el importe mínimo exacto de 0.01 €', () => {
    expect(validateAmount(0.01)).toBe(true);
  });

  // ── EqualityOperator #33: amount <= MAX → amount < MAX ───────────────────
  // Con <: el valor exacto 50000 sería rechazado (falso negativo).

  it('#33 acepta el importe máximo exacto de 50000 €', () => {
    expect(validateAmount(50_000)).toBe(true);
  });

  // ── EqualityOperator #38: balance >= amount → balance > amount ───────────
  // Con >: transferir exactamente el saldo disponible sería rechazado.

  it('#38 permite transferencia exactamente igual al saldo disponible', () => {
    const cuentaJusta: Account = { ...baseAccount, balance: 200 };
    expect(hasSufficientBalance(cuentaJusta, 200)).toBe(true);
  });

  // ── EqualityOperator #43: + amount > LIMIT → >= LIMIT ────────────────────
  // Con >=: una transferencia que completa exactamente el límite diario sería bloqueada.
  // 9000 acumulado + 1000 nueva = 10000 exacto → debe ser PERMITIDA (no supera el límite).

  it('#43 permite transferir hasta completar exactamente el límite diario de 10000 €', () => {
    const cuenta: Account = { ...baseAccount, dailyTransferredAmount: 9000 };
    expect(exceedsDailyLimit(cuenta, 1000)).toBe(false);
  });

  it('#43 bloquea si se supera el límite diario por un céntimo', () => {
    const cuenta: Account = { ...baseAccount, dailyTransferredAmount: 9000 };
    expect(exceedsDailyLimit(cuenta, 1000.01)).toBe(true);
  });

  // ── ConditionalExpression #61 y #62: rama que decide "mínimo" vs "máximo" ─
  // Si la condición se fuerza a true/false, el mensaje de error incorrecto aparece.

  it('#61 muestra el mensaje de importe MÍNIMO cuando el importe es menor que 0.01', () => {
    const result = validateTransfer({ ...validTransfer, amount: 0.001 });
    expect(result.errors).toContain('El importe mínimo es 0.01 €');
    expect(result.errors).not.toContain('El importe máximo es 50000 €');
  });

  it('#62 muestra el mensaje de importe MÁXIMO cuando el importe supera 50000', () => {
    const result = validateTransfer({ ...validTransfer, amount: 100_000 });
    expect(result.errors).toContain('El importe máximo es 50000 €');
    expect(result.errors).not.toContain('El importe mínimo es 0.01 €');
  });

  // ── EqualityOperator #63 y #64: operadores en la sub-rama de error ────────

  it('#63 el valor exacto 0.01 es válido, no genera error de mínimo', () => {
    const result = validateTransfer({ ...validTransfer, amount: 0.01 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('#64 el valor 0 genera error de mínimo, no de máximo', () => {
    const result = validateTransfer({ ...validTransfer, amount: 0 });
    expect(result.errors).toContain('El importe mínimo es 0.01 €');
    expect(result.errors).not.toContain('El importe máximo es 50000 €');
  });

  // ── StringLiteral #66: mensaje mínimo vaciado a cadena vacía ─────────────

  it('#66 el mensaje de importe mínimo contiene el valor concreto 0.01', () => {
    const result = validateTransfer({ ...validTransfer, amount: 0 });
    expect(result.errors.some((e) => e.includes('0.01'))).toBe(true);
  });

  // ── ConditionalExpression #75: condición exceedsDailyLimit → false siempre ─
  // Línea 69: if (exceedsDailyLimit(...)) { errors.push(...) }
  // Si la condición es siempre false, la transferencia que supera el límite
  // nunca produce error → result.valid sería true cuando debería ser false.

  it('#75 validateTransfer detecta cuando se supera el límite diario', () => {
    const cuentaAgotada: Account = { ...baseAccount, dailyTransferredAmount: 9500 };
    const result = validateTransfer({ ...validTransfer, fromAccount: cuentaAgotada, amount: 1000 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Límite diario'))).toBe(true);
  });

  // ── BlockStatement #76: bloque del límite diario vaciado → {} ────────────
  // Con el bloque vacío, el error nunca se añade aunque la condición sea true.

  it('#76 validateTransfer incluye el error de límite diario cuando corresponde', () => {
    const cuentaAgotada: Account = { ...baseAccount, dailyTransferredAmount: 9999 };
    const result = validateTransfer({ ...validTransfer, fromAccount: cuentaAgotada, amount: 100 });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('diario'))).toBe(true);
  });

  // ── StringLiteral #77: mensaje de límite diario vaciado a `` ─────────────
  // El mensaje debe contener el valor concreto del límite (10000).

  it('#77 el mensaje de límite diario contiene el valor 10000', () => {
    const cuentaAgotada: Account = { ...baseAccount, dailyTransferredAmount: 9500 };
    const result = validateTransfer({ ...validTransfer, fromAccount: cuentaAgotada, amount: 1000 });
    expect(result.errors.some((e) => e.includes('10000'))).toBe(true);
  });
});
