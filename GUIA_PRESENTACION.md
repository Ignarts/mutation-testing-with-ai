# Guía de presentación: Mutation Testing con IA

POC construida con TypeScript + Jest + StrykerJS sobre un validador de transferencias bancarias.

---

## Estructura de la sesión

| Bloque | Duración sugerida |
|---|---|
| El problema | 5 min |
| Qué es el mutation testing | 10 min |
| Demo en vivo | 15 min |
| El flujo para el equipo | 5 min |
| Preguntas | 10 min |

---

## 1. El problema: la cobertura de código miente

**Mensaje de apertura** — pregunta al equipo:

> "¿Cuántos de vosotros habéis visto un PR con 90% de cobertura y aun así habéis encontrado bugs en producción?"

La cobertura mide qué líneas se ejecutan durante los tests. No mide si esas líneas se comprueban de forma útil.

### La trampa de la tautología con IA

Con la IA el problema se amplifica:

1. La IA escribe el código
2. La IA genera los tests que "validan" ese mismo código
3. Resultado: 90% de cobertura cubriendo alucinaciones con más alucinaciones

> "Puedes tener un 90% de cobertura y estar cubriendo alucinaciones con más alucinaciones."

### Caso real (Eduardo Ferro, 2026)

- App Python con inventario
- **93% de cobertura**, 203 tests, todo en verde
- `mutmut` encontró **15 mutantes supervivientes**
- Huecos reales: manejo de errores en YAML no ejercitado, validaciones sin tests, paths de error en base de datos

**El dato que impacta:** 93% de cobertura + todo en verde ≠ tests de calidad.

---

## 2. Qué es el Mutation Testing

### La idea central

El mutation testing no evalúa el código — **evalúa la calidad de los tests**.

Proceso:

```
Código original (P)
        ↓
Se generan mutantes (P', P''...) — versiones con pequeños cambios sintácticos
        ↓
Se ejecuta la suite de tests contra cada mutante
        ↓
Test falla  → mutante KILLED   ✓ (los tests lo detectaron)
Test pasa   → mutante SURVIVED ✗ (hueco en la suite)
```

### Los operadores de mutación más relevantes para el equipo

Estos son los que aparecen en nuestra POC:

| Operador | Ejemplo | Por qué importa |
|---|---|---|
| `EqualityOperator` | `>=` → `>` | Límites exactos no testeados |
| `LogicalOperator` | `\|\|` → `&&` | Lógica de guardia rota |
| `ConditionalExpression` | condición → `true`/`false` | Ramas siempre activas/muertas |
| `StringLiteral` | mensaje → `""` | Mensajes de error no validados |
| `Regex` | `^` o `$` eliminados | Validaciones de formato incompletas |

### Los estados de un mutante

| Estado | Significado |
|---|---|
| **Killed** | Al menos un test falló — el cambio fue detectado ✓ |
| **Survived** | Todos los tests pasaron — hay un hueco real ✗ |
| **Equivalent** | El mutante es semánticamente idéntico al original — no se puede matar |
| **No coverage** | Ningún test llega siquiera al código mutado |

### El Mutation Score

```
Mutation Score = (Killed + Timeout) / (Total − Equivalentes) × 100
```

Un 70% significa que 3 de cada 10 mutantes sobreviven. Cada superviviente es un bug real que tus tests no detectarían.

### Las dos hipótesis detrás de la técnica

- **Competent Programmer Hypothesis:** los bugs reales son pequeños cambios sintácticos, como los mutantes.
- **Coupling Effect:** si los tests detectan bugs simples, también detectan combinaciones complejas.

---

## 3. La demo: validador de transferencias

### El código bajo test

```typescript
// src/transferValidator.ts
const DAILY_LIMIT = 10_000;
const MIN_TRANSFER = 0.01;
const MAX_TRANSFER = 50_000;

export function validateAmount(amount: number): boolean {
  return amount >= MIN_TRANSFER && amount <= MAX_TRANSFER;
}

export function hasSufficientBalance(account: Account, amount: number): boolean {
  return account.balance >= amount;
}

export function exceedsDailyLimit(account: Account, amount: number): boolean {
  return account.dailyTransferredAmount + amount > DAILY_LIMIT;
}
```

Validaciones: IBAN, importe (0.01 € – 50.000 €), saldo disponible, límite diario (10.000 €), moneda.

### Primera ronda: la suite "generada por IA"

21 tests escritos como lo haría una IA sin feedback: todos en verde, buena cobertura.

```bash
npm test
# Tests: 21 passed, 21 total ✓
```

```bash
npm run mutation
# Mutation Score: 70.51%
# Mutantes: 87 generados, 19 sobrevivieron
```

**Pausa aquí.** Preguntar al equipo:

> "21 tests, todos en verde. ¿Os parece suficiente?"

### Los 19 mutantes supervivientes — huecos reales

#### Valores límite exactos (4 mutantes `EqualityOperator`)

```typescript
// Stryker mutó esto:
return amount >= MIN_TRANSFER && amount <= MAX_TRANSFER;

// A esto — y todos los tests siguieron pasando:
return amount > MIN_TRANSFER && amount <= MAX_TRANSFER;
//            ^ sin el =
```

**¿Por qué sobrevivió?** Nadie testea `amount === 0.01`. Todos los tests usan 100, 500, 0 o -1.

Los cuatro límites no testeados:
- `amount === 0.01` (mínimo exacto)
- `amount === 50_000` (máximo exacto)
- `balance === amount` (saldo exactamente igual al importe)
- `dailyTransferred + amount === 10_000` (límite diario exacto)

#### Regex del IBAN (6 mutantes `Regex`)

```typescript
// Regex original:
const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}$/;

// Mutante — ancla ^ eliminada:
const IBAN_REGEX = /[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}$/;
// Sin ^, "XXXES7620770024003102575766" pasaría la validación
```

**¿Por qué sobrevivió?** Los tests solo prueban IBANs totalmente válidos o totalmente inválidos. Nadie testea un string que tenga un IBAN válido incrustado en texto basura.

#### Mensajes de error (2 mutantes `StringLiteral`)

```typescript
// Stryker mutó esto:
errors.push(`El importe mínimo es ${MIN_TRANSFER} €`);

// A esto — y los tests siguieron pasando:
errors.push(``);
```

**¿Por qué sobrevivió?** Los tests comprueban `result.valid === false` pero no el texto exacto de los errores. En una API bancaria, el mensaje de error es parte del contrato.

### Segunda ronda: tests dirigidos por cada mutante

Para cada mutante superviviente, un test que lo mata:

```typescript
// Mata el mutante >= → > (importe mínimo)
it('acepta el importe mínimo exacto de 0.01 €', () => {
  expect(validateAmount(0.01)).toBe(true);
  //                    ^^^^ valor límite exacto
});

// Mata el mutante sin ancla ^
it('rechaza string con prefijo basura antes del IBAN', () => {
  expect(validateIBAN('XXXES7620770024003102575766')).toBe(false);
});

// Mata el mutante de mensaje vacío
it('el mensaje de error contiene el valor 0.01', () => {
  const result = validateTransfer({ ...transfer, amount: 0 });
  expect(result.errors.some(e => e.includes('0.01'))).toBe(true);
});
```

```bash
npm test
# Tests: 42 passed, 42 total ✓

npm run mutation
# Mutation Score: 96.15%
# Supervivientes: 3 (equivalentes — ver más abajo)
```

### Los 3 supervivientes finales son mutantes equivalentes

| Mutante | Por qué es equivalente |
|---|---|
| `([A-Z0-9]?){0,16}` → `([A-Z0-9]){0,16}` | Comportamiento idéntico — `{0,16}` ya permite 0 repeticiones |
| `amount < MIN` → `amount <= MIN` en la rama de error | Solo llega aquí si `validateAmount` falló; cualquier valor que llegue es `< MIN` o `> MAX`, nunca `=== MIN` |
| Mensaje de moneda → `""` | Falta un test que valide el texto exacto de ese error concreto |

El tercero no es un equivalente real — es un hueco que podemos cerrar. Los dos primeros son inmatables por el diseño del código.

### Resumen de la demo

| Fase | Tests | Mutation Score | Supervivientes |
|---|---|---|---|
| Suite inicial (IA ciega) | 21 | 70.51% | 19 |
| + Tests dirigidos | 42 | 96.15% | 3 |

**El dato que lleva a casa:** pasamos de 21 a 42 tests. El trabajo extra fue mínimo. El incremento de confianza fue enorme.

---

## 4. El flujo práctico para el equipo

### Fase 1 — Baseline con Stryker (una vez)

```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/jest-runner
npx stryker run

# Guardar el baseline incremental
git add stryker-incremental.json
```

Este fichero es el punto de referencia. A partir de aquí Stryker solo ejecuta mutantes nuevos.

### Fase 2 — CI/CD incremental (en cada PR)

```yaml
# .github/workflows/ci.yml
- name: Tests con mutation testing incremental
  run: npx stryker run --incremental
  # Falla el PR si el score cae por debajo del umbral configurado
```

Ejemplo real de rendimiento: 3.731 de 3.965 resultados reutilizados — solo 234 mutantes nuevos ejecutados en un PR.

### Fase 3 — IA cierra los huecos (la parte nueva)

Para cada mutante superviviente del informe HTML de Stryker:

```
Prompt al LLM:
"Este mutante sobrevivió:
 - Código original: account.balance >= amount
 - Mutante: account.balance > amount
 - Tests existentes: [adjuntar]
Escribe un test unitario que mate este mutante."
```

Revisar, ajustar si es necesario, añadir al repositorio. Re-ejecutar Stryker para confirmar que el mutante muere.

### Fase 4 — Mutantes LLM para lógica crítica (avanzado)

Para lógica de alto riesgo (autenticación, pagos, privacidad):

```
En lugar de operadores sintácticos fijos,
el LLM genera mutantes semánticamente significativos
basados en una descripción de la clase de fallo:

"El código no debe registrar IDs de usuario en logs"
        ↓
LLM genera mutantes que violan esa propiedad
        ↓
LLM genera tests que los capturan
```

Referencia: sistema ACH de Meta — 73% de tests aceptados por ingenieros, desplegado en Facebook, Instagram, WhatsApp.

### Umbrales recomendados

| Capa | Mutation Score objetivo |
|---|---|
| Lógica de negocio crítica (auth, pagos) | **80%+** |
| Código de aplicación general | 60–70% |
| Capa de UI / presentación | 40–60% |

No hace falta perseguir el 100%. Los mutantes equivalentes hacen que sea imposible y los rendimientos decrecientes no compensan.

---

## 5. Herramientas

| Herramienta | Lenguaje | Coste | Tipo de mutante |
|---|---|---|---|
| **StrykerJS** | JS / TS | Gratis | Sintáctico (rápido, limpio) |
| **Stryker.NET** | C# / .NET | Gratis | Sintáctico |
| **PITest** | Java | Gratis | Sintáctico |
| **mutmut** | Python | Gratis | Sintáctico |
| **LLMorpheus** | JS / TS | Coste API LLM | Semántico (más realista) |
| **Mutahunter** | Agnóstico | Coste API LLM | Semántico |

Para empezar: StrykerJS. Para lógica de dominio crítica en siguientes pasos: LLMorpheus o Mutahunter encima de Stryker.

---

## 6. Posibles preguntas del equipo

**"¿No es demasiado lento para CI?"**
Con el modo incremental de Stryker, solo se ejecutan los mutantes de los ficheros que han cambiado en el PR. El coste es proporcional al cambio, no al tamaño del proyecto.

**"¿Qué pasa con los mutantes equivalentes?"**
Son una realidad del proceso. El Mutation Score excluye los equivalentes de la fórmula, así que no penalizan el score. En la práctica son una minoría pequeña.

**"¿Sustituye al coverage?"**
No, lo complementa. El coverage sigue siendo útil como señal de qué código no se ejecuta en absoluto. El mutation score dice cuánto de lo que se ejecuta se verifica de verdad.

**"¿Con qué empezamos?"**
Con el módulo más crítico del proyecto. Un solo fichero con lógica de negocio densa produce mutantes con mucho valor diagnóstico. No hace falta arrancar en todo el repositorio.

**"¿Qué hacemos con los supervivientes que no podemos matar?"**
Tres opciones: (1) escribir el test dirigido, (2) marcarlo como equivalente con un comentario en el config de Stryker, (3) ignorarlo si el riesgo de negocio es bajo.

---

## 7. El mensaje de cierre

> "La IA nos da velocidad para crear tests. El mutation testing nos da la señal para saber si esos tests sirven de algo. La combinación rompe el ciclo vicioso: ya no podemos cubrir alucinaciones con más alucinaciones."

> "Lo moderno no elimina lo aburrido, solo te obliga a hacerlo mejor. La IA cambia la velocidad a la que puedes crear tests, no la necesidad de pensar cuáles merecen existir."

---

## Recursos

- Código de la POC: [`/src/transferValidator.ts`](src/transferValidator.ts)
- Tests iniciales: [`/tests/transferValidator.test.ts`](tests/transferValidator.test.ts)
- Tests killer: [`/tests/transferValidator.killers.test.ts`](tests/transferValidator.killers.test.ts)
- Informe Stryker: [`/reports/mutation/index.html`](reports/mutation/index.html)
- StrykerJS: <https://stryker-mutator.io>
- LLMorpheus: <https://github.com/githubnext/llmorpheus>
- Paper Meta ACH: <https://arxiv.org/abs/2501.12862>
