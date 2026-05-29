# Mutation Testing con IA

> POC: validador de transferencias bancarias en **TypeScript + Jest + StrykerJS**, con un script que usa la **API de Claude** para generar automáticamente los tests que matan los mutantes supervivientes.

---

## El problema: la cobertura de código miente

La cobertura mide qué líneas se ejecutan durante los tests. No mide si esas líneas se comprueban de forma útil.

Con IA el problema se amplifica:

1. La IA escribe el código.
2. La IA genera los tests que "validan" ese mismo código.
3. Resultado: 90% de cobertura cubriendo alucinaciones con más alucinaciones.

**Caso real (Eduardo Ferro, 2026):** app Python con 93% de cobertura, 203 tests, todo en verde. `mutmut` encontró 15 mutantes supervivientes — manejo de errores en YAML no ejercitado, validaciones sin tests, paths de error en base de datos.

**El dato que impacta:** 93% de cobertura + todo en verde ≠ tests de calidad.

---

## ¿Qué es el Mutation Testing?

El mutation testing no evalúa el código — **evalúa la calidad de los tests**.

```
Código original (P)
        ↓
Se generan mutantes (P', P''...) — versiones con pequeños cambios sintácticos
        ↓
Se ejecuta la suite de tests contra cada mutante
        ↓
Test falla  → mutante KILLED   ✓  (los tests lo detectaron)
Test pasa   → mutante SURVIVED ✗  (hueco real en la suite)
```

### Operadores de mutación más relevantes

| Operador | Ejemplo | Por qué importa |
|---|---|---|
| `EqualityOperator` | `>=` → `>` | Límites exactos no testeados |
| `LogicalOperator` | `\|\|` → `&&` | Lógica de guardia rota |
| `ConditionalExpression` | condición → `true`/`false` | Ramas siempre activas/muertas |
| `StringLiteral` | mensaje → `""` | Mensajes de error no validados |
| `Regex` | `^` o `$` eliminados | Validaciones de formato incompletas |

### Mutation Score

```
Mutation Score = (Killed + Timeout) / (Total − Equivalentes) × 100
```

Un 70% significa que 3 de cada 10 mutantes sobreviven. Cada superviviente es un bug real que tus tests no detectarían.

---

## Estructura del proyecto

```
mutation-testing-with-ai/
├── src/
│   └── transferValidator.ts          # Lógica de negocio bajo test
├── tests/
│   ├── transferValidator.test.ts     # Suite inicial (generada con IA)
│   └── transferValidator.killers.test.ts  # Tests dirigidos (generados por kill-survivors.ts)
├── scripts/
│   └── kill-survivors.ts             # Script: lee mutantes supervivientes → llama a Claude → genera tests
├── stryker.config.json               # Configuración principal de Stryker (umbral 80%)
├── stryker.demo.json                 # Configuración reducida para demos
└── reports/mutation/                 # Informe HTML/JSON generado por Stryker
```

---

## Instalación

```bash
git clone https://github.com/Ignarts/mutation-testing-with-ai.git
cd mutation-testing-with-ai
npm install
```

Copia el fichero de entorno y añade tu API key de Anthropic:

```bash
cp .env.example .env
# Edita .env y añade: ANTHROPIC_API_KEY=sk-ant-...
```

---

## Uso

### Tests unitarios

```bash
npm test               # Ejecuta todos los tests
npm run test:coverage  # Tests con informe de cobertura
```

### Mutation testing

```bash
npm run mutation       # Stryker completo (genera reports/mutation/index.html)
npm run mutation:demo  # Versión reducida para demos rápidas
```

### Cerrar huecos automáticamente con IA

Tras ejecutar `npm run mutation`, si hay supervivientes:

```bash
npm run kill-survivors
# Lee reports/mutation/mutation.json
# Llama a Claude con cada mutante superviviente
# Genera tests/transferValidator.killers.test.ts
```

Luego re-ejecuta Stryker para confirmar que el score sube:

```bash
npm run mutation
```

---

## La demo paso a paso

### Código bajo test

`src/transferValidator.ts` implementa un validador de transferencias bancarias con cinco reglas:

- **IBAN** — formato válido con regex
- **Importe** — entre 0,01 € y 50.000 €
- **Saldo** — la cuenta tiene fondos suficientes
- **Límite diario** — no supera los 10.000 €
- **Moneda** — coincide con la cuenta de origen

### Primera ronda — suite generada con IA (sin feedback)

```bash
npm test
# 21 tests, todos en verde ✓

npm run mutation
# Mutation Score: 70,51%
# 19 mutantes supervivientes ✗
```

#### Los 19 huecos reales

**Valores límite exactos** (4 mutantes `EqualityOperator`)

```typescript
// Stryker mutó esto:
return amount >= MIN_TRANSFER && amount <= MAX_TRANSFER;

// A esto — y todos los tests pasaron:
return amount > MIN_TRANSFER && amount <= MAX_TRANSFER;
//            ^ sin el =
```

Nadie testea `amount === 0.01`. Todos los tests usan 100, 500, 0 o -1.

**Regex del IBAN** (6 mutantes `Regex`)

```typescript
// Mutante — ancla ^ eliminada:
const IBAN_REGEX = /[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}$/;
// Sin ^, "XXXES7620770024003102575766" pasaría la validación
```

**Mensajes de error** (2 mutantes `StringLiteral`)

```typescript
// Mutante — mensaje vaciado:
errors.push(``);
// Los tests comprueban result.valid === false, no el texto del error
```

### Segunda ronda — tests dirigidos por cada mutante

```bash
npm run kill-survivors
# Claude genera un test por cada mutante superviviente

npm test
# 42 tests, todos en verde ✓

npm run mutation
# Mutation Score: 96,15%
# 3 supervivientes (equivalentes) ✓
```

### Resumen

| Fase | Tests | Mutation Score | Supervivientes |
|---|---|---|---|
| Suite inicial (IA ciega) | 21 | 70,51% | 19 |
| + Tests dirigidos por mutantes | 42 | 96,15% | 3 |

Los 3 supervivientes restantes son **mutantes equivalentes** — semánticamente idénticos al original, inmatables por diseño.

---

## Flujo para equipos

### 1. Baseline con Stryker (una vez)

```bash
npx stryker run
git add stryker-incremental.json  # punto de referencia incremental
```

### 2. CI/CD incremental (en cada PR)

```yaml
# .github/workflows/ci.yml
- name: Mutation testing incremental
  run: npx stryker run --incremental
  # Falla el PR si el score cae por debajo del umbral configurado (stryker.config.json: 80%)
```

Rendimiento real: de ~3.965 mutantes totales, solo ~234 se re-ejecutan en un PR típico.

### 3. IA cierra los huecos

Para cada mutante superviviente del informe Stryker:

```
Prompt al LLM:
"Este mutante sobrevivió:
 - Código original: account.balance >= amount
 - Mutante: account.balance > amount
 - Tests existentes: [adjuntar]
Escribe un test unitario que mate este mutante."
```

O directamente: `npm run kill-survivors`.

### Umbrales recomendados

| Capa | Mutation Score objetivo |
|---|---|
| Lógica de negocio crítica (auth, pagos) | **80 %+** |
| Código de aplicación general | 60–70 % |
| Capa de UI / presentación | 40–60 % |

---

## Herramientas

| Herramienta | Lenguaje | Tipo de mutante |
|---|---|---|
| **StrykerJS** | JS / TS | Sintáctico (rápido) |
| **Stryker.NET** | C# / .NET | Sintáctico |
| **PITest** | Java | Sintáctico |
| **mutmut** | Python | Sintáctico |
| **LLMorpheus** | JS / TS | Semántico (más realista) |
| **Mutahunter** | Agnóstico | Semántico |

---

## Referencias

- [StrykerJS](https://stryker-mutator.io)
- [LLMorpheus](https://github.com/githubnext/llmorpheus)
- [Paper Meta ACH — mutation testing a escala](https://arxiv.org/abs/2501.12862)
- [`src/transferValidator.ts`](src/transferValidator.ts) — código bajo test
- [`tests/transferValidator.test.ts`](tests/transferValidator.test.ts) — suite inicial
- [`tests/transferValidator.killers.test.ts`](tests/transferValidator.killers.test.ts) — tests killer
