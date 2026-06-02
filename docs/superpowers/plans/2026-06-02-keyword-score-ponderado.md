# Score Ponderado de Palavras-chave — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o gate booleano (OU) da classificação por um score aditivo de 7 filtros pesados com faixas (tiers) por nota, para parar a enxurrada de "Oportunidade Excelente".

**Architecture:** Toda a lógica nova fica em `frontend/lib/server/keywordEvaluator.ts` como funções puras (`scoreItem`, `tierForScore`, `buildMotivo`), testadas em isolamento. `classifyScope` passa a montar a `Classificacao` a partir dessas funções. `frontend/lib/types.ts` ganha `FiltroResultado` e 2 campos novos na `Classificacao`. Campos antigos (`score_value`, `score_eficiencia`) seguem sendo calculados para não quebrar xlsx/tabela. Pesos/limiares/cortes saem de env via `readKnobs`, seguindo o padrão existente.

**Tech Stack:** TypeScript, Next.js 15, vitest (novo — para testes de unidade das funções puras).

Spec de referência: [docs/superpowers/specs/2026-06-02-keyword-score-ponderado-design.md](../specs/2026-06-02-keyword-score-ponderado-design.md)

---

## Estrutura de arquivos

- `frontend/package.json` — adicionar `vitest` (devDep) + script `test`.
- `frontend/lib/types.ts` — `FiltroResultado` + campos `score_total`, `filtros` em `Classificacao`.
- `frontend/lib/server/keywordEvaluator.ts` — novos knobs, `scoreItem`, `tierForScore`, `buildMotivo`, `classifyScope` reescrito.
- `frontend/lib/server/keywordEvaluator.test.ts` — testes das funções puras (novo).

---

## Task 1: Adicionar vitest

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Instalar vitest**

Run (no diretório `frontend`):
```bash
npm install -D vitest@^2
```
Expected: vitest aparece em `devDependencies`, sem erros de peer-dep fatais.

- [ ] **Step 2: Adicionar script de teste**

Em `frontend/package.json`, dentro de `"scripts"`, adicionar a linha após `"lint"`:
```json
    "test": "vitest run",
```

- [ ] **Step 3: Smoke test do runner**

Run:
```bash
npx vitest run
```
Expected: roda e diz "No test files found" (ainda não há testes) — confirma que o runner funciona.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): add vitest for unit tests"
```

---

## Task 2: Tipos — FiltroResultado e campos novos em Classificacao

**Files:**
- Modify: `frontend/lib/types.ts:19-25`

- [ ] **Step 1: Adicionar o tipo e os campos**

Em `frontend/lib/types.ts`, substituir o bloco do tipo `Classificacao` (linhas 19-25) por:

```ts
export type FiltroResultado = { nome: string; peso: number; ok: boolean };

export type Classificacao = {
  tier: Tier;
  rotulo: string;
  motivo: string;
  score_value: number;
  score_eficiencia: number;
  score_total: number;
  filtros: FiltroResultado[];
};
```

- [ ] **Step 2: Verificar tipos**

Run (no diretório `frontend`):
```bash
npx tsc --noEmit
```
Expected: erros APENAS em `keywordEvaluator.ts` (ainda não preenche os campos novos). Nenhum erro em `types.ts`, xlsx ou pages. Isso confirma que o tipo compila.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types.ts
git commit -m "feat(types): add FiltroResultado and weighted score fields to Classificacao"
```

---

## Task 3: Novos knobs de configuração

**Files:**
- Modify: `frontend/lib/server/keywordEvaluator.ts:26-60`

- [ ] **Step 1: Estender o tipo Knobs**

Em `frontend/lib/server/keywordEvaluator.ts`, substituir o tipo `Knobs` (linhas 26-35) por:

```ts
type Knobs = {
  enabled: boolean;
  intentFilter: boolean;
  scope: "per_tab" | "global";
  minVolume: number;
  // pesos dos filtros
  wVolForte: number;
  wVolBase: number;
  wCresc3m: number;
  wCrescAno: number;
  wConcBaixa: number;
  wCpc: number;
  wLeilao: number;
  // limiares dos filtros
  tVolForte: number;
  tVolBase: number;
  tCresc3m: number;
  tConcBaixa: number;
  tLeilaoSpread: number;
  // cortes de tier
  tierExcelente: number;
  tierOtimo: number;
  tierTalvez: number;
  // DEPRECADOS (mantidos só para leitura — não usados na nova lógica)
  pExcelente: number;
  pOtimo: number;
  compBaixaMax: number;
  compAltaMin: number;
};
```

- [ ] **Step 2: Estender readKnobs**

Substituir o `return {...}` dentro de `readKnobs` (linhas 50-59) por:

```ts
  return {
    enabled: bool(readEnv("EVALUATOR_ENABLED"), true),
    intentFilter: bool(readEnv("EVALUATOR_INTENT_FILTER_ENABLED"), true),
    scope: scopeRaw === "global" ? "global" : "per_tab",
    minVolume: num(readEnv("EVALUATOR_MIN_VOLUME"), 30),
    wVolForte: num(readEnv("EVALUATOR_W_VOL_FORTE"), 3),
    wVolBase: num(readEnv("EVALUATOR_W_VOL_BASE"), 1),
    wCresc3m: num(readEnv("EVALUATOR_W_CRESC_3M"), 3),
    wCrescAno: num(readEnv("EVALUATOR_W_CRESC_ANO"), 1),
    wConcBaixa: num(readEnv("EVALUATOR_W_CONC_BAIXA"), 2),
    wCpc: num(readEnv("EVALUATOR_W_CPC"), 1),
    wLeilao: num(readEnv("EVALUATOR_W_LEILAO"), 1),
    tVolForte: num(readEnv("EVALUATOR_T_VOL_FORTE"), 2500),
    tVolBase: num(readEnv("EVALUATOR_T_VOL_BASE"), 500),
    tCresc3m: num(readEnv("EVALUATOR_T_CRESC_3M"), 10),
    tConcBaixa: num(readEnv("EVALUATOR_T_CONC_BAIXA"), 33),
    tLeilaoSpread: num(readEnv("EVALUATOR_T_LEILAO_SPREAD"), 0.5),
    tierExcelente: num(readEnv("EVALUATOR_TIER_EXCELENTE"), 0.7),
    tierOtimo: num(readEnv("EVALUATOR_TIER_OTIMO"), 0.45),
    tierTalvez: num(readEnv("EVALUATOR_TIER_TALVEZ"), 0.2),
    pExcelente: num(readEnv("EVALUATOR_P_EXCELENTE"), 0.6),
    pOtimo: num(readEnv("EVALUATOR_P_OTIMO"), 0.55),
    compBaixaMax: num(readEnv("EVALUATOR_COMP_BAIXA_MAX"), 33),
    compAltaMin: num(readEnv("EVALUATOR_COMP_ALTA_MIN"), 66),
  };
```

- [ ] **Step 3: Verificar tipos**

Run (no diretório `frontend`):
```bash
npx tsc --noEmit
```
Expected: ainda erro de campos faltando na `Classificacao` em `classifyScope` (esperado, próximas tasks). `readKnobs`/`Knobs` sem erro.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/server/keywordEvaluator.ts
git commit -m "feat(evaluator): add weighted-score knobs to readKnobs"
```

---

## Task 4: tierForScore (função pura) — TDD

**Files:**
- Modify: `frontend/lib/server/keywordEvaluator.ts`
- Test: `frontend/lib/server/keywordEvaluator.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/lib/server/keywordEvaluator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readKnobs, tierForScore } from "./keywordEvaluator";

const knobs = readKnobs(() => undefined); // defaults

describe("tierForScore", () => {
  it("0.70+ é oportunidade excelente", () => {
    expect(tierForScore(0.7, knobs)).toBe("oportunidade_excelente");
    expect(tierForScore(0.95, knobs)).toBe("oportunidade_excelente");
  });
  it("0.45..0.69 é otimo", () => {
    expect(tierForScore(0.45, knobs)).toBe("otimo");
    expect(tierForScore(0.69, knobs)).toBe("otimo");
  });
  it("0.20..0.44 é talvez", () => {
    expect(tierForScore(0.2, knobs)).toBe("talvez");
    expect(tierForScore(0.44, knobs)).toBe("talvez");
  });
  it("abaixo de 0.20 é negativar", () => {
    expect(tierForScore(0.19, knobs)).toBe("negativar");
    expect(tierForScore(0, knobs)).toBe("negativar");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (no diretório `frontend`):
```bash
npx vitest run keywordEvaluator
```
Expected: FAIL — `tierForScore` não exportado / não existe.

- [ ] **Step 3: Implementar tierForScore**

Em `frontend/lib/server/keywordEvaluator.ts`, adicionar após a função `emptyResumo` (linha ~132):

```ts
export function tierForScore(score: number, knobs: Knobs): Tier {
  if (score >= knobs.tierExcelente) return "oportunidade_excelente";
  if (score >= knobs.tierOtimo) return "otimo";
  if (score >= knobs.tierTalvez) return "talvez";
  return "negativar";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run:
```bash
npx vitest run keywordEvaluator
```
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/server/keywordEvaluator.ts frontend/lib/server/keywordEvaluator.test.ts
git commit -m "feat(evaluator): add tierForScore"
```

---

## Task 5: scoreItem (função pura) — TDD

**Files:**
- Modify: `frontend/lib/server/keywordEvaluator.ts`
- Test: `frontend/lib/server/keywordEvaluator.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `frontend/lib/server/keywordEvaluator.test.ts`:

```ts
import { scoreItem } from "./keywordEvaluator";

const ctx = { cpcMedian: 5 };

describe("scoreItem", () => {
  it("palavra forte (volume alto + crescendo + concorrência baixa) tem score alto", () => {
    const item = {
      media_pesquisas: 4000,
      mudanca_tres_meses: "18%",
      mudanca_ano_anterior: "10%",
      grau_concorrencia: 20,
      maior_lance_topo: 3,
      menor_lance_topo: 2,
    };
    const { score_total } = scoreItem(item, ctx, knobs);
    expect(score_total).toBeGreaterThanOrEqual(0.7);
  });

  it("apenas CPC abaixo da mediana (1 sinal fraco) NÃO chega a excelente", () => {
    // regressão do bug: antes 1 sinal já liberava excelente
    const item = {
      media_pesquisas: 100, // < base
      grau_concorrencia: 80, // alta
      maior_lance_topo: 3, // <= mediana 5 → passa só esse
      menor_lance_topo: 2.9,
    };
    const { score_total } = scoreItem(item, ctx, knobs);
    expect(tierForScore(score_total, knobs)).not.toBe("oportunidade_excelente");
  });

  it("dado faltante não pune: divide só pelos filtros com dado", () => {
    // sem trend, sem cpc: só volume conta. volume forte+base atendidos.
    const item = { media_pesquisas: 5000 };
    const { score_total, filtros } = scoreItem(item, ctx, knobs);
    // pesos com dado = vol forte (3) + vol base (1) = 4; obtidos = 4 → 1.0
    expect(score_total).toBe(1);
    // filtros sem dado ficam ok:false
    expect(filtros.find((f) => f.nome === "Crescimento 3 meses")?.ok).toBe(false);
  });

  it("retorna os 7 filtros nomeados", () => {
    const { filtros } = scoreItem({ media_pesquisas: 1000 }, ctx, knobs);
    expect(filtros.map((f) => f.nome)).toEqual([
      "Volume forte",
      "Volume base",
      "Crescimento 3 meses",
      "Não declina (ano)",
      "Concorrência baixa",
      "CPC eficiente",
      "Leilão estável",
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run:
```bash
npx vitest run keywordEvaluator
```
Expected: FAIL — `scoreItem` não existe.

- [ ] **Step 3: Implementar scoreItem**

Em `frontend/lib/server/keywordEvaluator.ts`, adicionar após `tierForScore`:

```ts
export type ScopeCtx = { cpcMedian: number | null };

export function scoreItem(
  item: Item,
  ctx: ScopeCtx,
  knobs: Knobs
): { filtros: FiltroResultado[]; score_total: number } {
  const volume = volumeOf(item);
  const c3m = parsePercent(item.mudanca_tres_meses);
  const cAno = parsePercent(item.mudanca_ano_anterior);
  const grade = gradeOf(item);
  const cpc = cpcOf(item); // maior_lance_topo
  const menor = toNumber(item.menor_lance_topo);

  const filtros: FiltroResultado[] = [];
  let pesoObtido = 0;
  let pesoDisponivel = 0;

  const add = (nome: string, peso: number, temDado: boolean, ok: boolean) => {
    const passou = temDado && ok;
    filtros.push({ nome, peso, ok: passou });
    if (!temDado) return;
    pesoDisponivel += peso;
    if (passou) pesoObtido += peso;
  };

  add("Volume forte", knobs.wVolForte, true, volume >= knobs.tVolForte);
  add("Volume base", knobs.wVolBase, true, volume >= knobs.tVolBase);
  add("Crescimento 3 meses", knobs.wCresc3m, c3m != null, (c3m ?? 0) >= knobs.tCresc3m);
  add("Não declina (ano)", knobs.wCrescAno, cAno != null, (cAno ?? 0) >= 0);
  add("Concorrência baixa", knobs.wConcBaixa, grade != null, (grade ?? 100) <= knobs.tConcBaixa);

  const cpcTemDado = cpc != null && ctx.cpcMedian != null;
  add("CPC eficiente", knobs.wCpc, cpcTemDado, cpcTemDado && cpc! <= ctx.cpcMedian!);

  const spreadTemDado = cpc != null && menor != null && cpc > 0;
  const spread = spreadTemDado ? (cpc! - menor!) / cpc! : null;
  add("Leilão estável", knobs.wLeilao, spreadTemDado, spread != null && spread <= knobs.tLeilaoSpread);

  const score_total = pesoDisponivel > 0 ? round2(pesoObtido / pesoDisponivel) : 0;
  return { filtros, score_total };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run:
```bash
npx vitest run keywordEvaluator
```
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/server/keywordEvaluator.ts frontend/lib/server/keywordEvaluator.test.ts
git commit -m "feat(evaluator): add scoreItem with 7 weighted filters"
```

---

## Task 6: buildMotivo (função pura) — TDD

**Files:**
- Modify: `frontend/lib/server/keywordEvaluator.ts`
- Test: `frontend/lib/server/keywordEvaluator.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do arquivo de teste:

```ts
import { buildMotivo } from "./keywordEvaluator";

describe("buildMotivo", () => {
  it("lista os filtros aprovados e a nota", () => {
    const filtros = [
      { nome: "Volume forte", peso: 3, ok: true },
      { nome: "Crescimento 3 meses", peso: 3, ok: true },
      { nome: "CPC eficiente", peso: 1, ok: false },
    ];
    const m = buildMotivo(0.75, filtros, 3100);
    expect(m).toContain("0.75");
    expect(m).toContain("volume forte");
    expect(m).toContain("crescimento 3 meses");
    expect(m).not.toContain("cpc eficiente");
  });

  it("sem filtros aprovados, explica sinal fraco com volume", () => {
    const m = buildMotivo(0.05, [{ nome: "Volume forte", peso: 3, ok: false }], 120);
    expect(m).toContain("120");
    expect(m.toLowerCase()).toContain("nenhum");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run:
```bash
npx vitest run keywordEvaluator
```
Expected: FAIL — `buildMotivo` não existe.

- [ ] **Step 3: Implementar buildMotivo**

Em `frontend/lib/server/keywordEvaluator.ts`, adicionar após `scoreItem`:

```ts
export function buildMotivo(score: number, filtros: FiltroResultado[], volume: number): string {
  const aprovados = filtros.filter((f) => f.ok).map((f) => f.nome.toLowerCase());
  if (!aprovados.length) {
    return `Score ${score.toFixed(2)} — nenhum sinal forte (${Math.round(volume)} buscas/mês).`;
  }
  return `Score ${score.toFixed(2)} — ${aprovados.join(", ")}.`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run:
```bash
npx vitest run keywordEvaluator
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/server/keywordEvaluator.ts frontend/lib/server/keywordEvaluator.test.ts
git commit -m "feat(evaluator): add buildMotivo from passed filters"
```

---

## Task 7: Ligar tudo em classifyScope

**Files:**
- Modify: `frontend/lib/server/keywordEvaluator.ts:134-212`
- Test: `frontend/lib/server/keywordEvaluator.test.ts`

- [ ] **Step 1: Escrever o teste de integração que falha**

Adicionar ao final do arquivo de teste:

```ts
import { evaluateItems } from "./keywordEvaluator";

describe("evaluateItems (integração)", () => {
  const readEnv = () => undefined;

  it("palavra forte vira oportunidade_excelente", async () => {
    const { items } = await evaluateItems(
      readEnv,
      [{ name: "implante dentário", media_pesquisas: 4000, mudanca_tres_meses: "20%", mudanca_ano_anterior: "5%", grau_concorrencia: 15, maior_lance_topo: 3, menor_lance_topo: 2 }],
      [],
      "odonto"
    );
    const cls = (items[0] as { classificacao: { tier: string; score_total: number; filtros: unknown[] } }).classificacao;
    expect(cls.tier).toBe("oportunidade_excelente");
    expect(cls.score_total).toBeGreaterThanOrEqual(0.7);
    expect(cls.filtros.length).toBe(7);
  });

  it("palavra fraca (1 sinal) NÃO vira excelente — regressão do bug", async () => {
    const { items } = await evaluateItems(
      readEnv,
      [{ name: "x", media_pesquisas: 80, grau_concorrencia: 90, maior_lance_topo: 0.5, menor_lance_topo: 0.4 }],
      [],
      "odonto"
    );
    const cls = (items[0] as { classificacao: { tier: string } }).classificacao;
    expect(cls.tier).not.toBe("oportunidade_excelente");
  });
});
```

Nota: o gate de intenção usa `classifyKeywordIntent`; sem `OPENROUTER_API_KEY` no env ele não marca nada como negativo (ver [openRouter.ts:75](../../../frontend/lib/server/openRouter.ts#L75)), então os testes acima passam pela trilha de score normalmente.

- [ ] **Step 2: Rodar e ver falhar**

Run:
```bash
npx vitest run keywordEvaluator
```
Expected: FAIL — `classifyScope` ainda não preenche `score_total`/`filtros` (erro de tipo ou tier errado).

- [ ] **Step 3: Reescrever classifyScope**

Em `frontend/lib/server/keywordEvaluator.ts`, substituir a função `classifyScope` inteira (linhas 134-212) por:

```ts
function classifyScope(
  items: Item[],
  knobs: Knobs,
  negativeNames: Set<string>
): { item: Item; classificacao: Classificacao }[] {
  const volumes = items.map(volumeOf);
  const cpcs = items.map(cpcOf).filter((v): v is number => v != null);
  const volPct = percentileMap(volumes);
  const cpcPct = cpcs.length ? percentileMap(cpcs) : null;
  const cpcMedian = median(cpcs);
  const ctx: ScopeCtx = { cpcMedian };

  return items.map((item) => {
    const name = String(item.name ?? "").trim();
    const volume = volumeOf(item);
    const grade = gradeOf(item);
    const cpc = cpcOf(item);
    const trend = trendOf(item);

    // Scores antigos mantidos para xlsx/tabela.
    const scoreValue = round2(clamp01(volPct(volume)));
    const compComponent = grade != null ? 1 - clamp01(grade / 100) : 0.4;
    const cpcComponent = cpc != null && cpcPct ? 1 - clamp01(cpcPct(cpc)) : 0.5;
    const trendComponent = trend == null ? 0.5 : trend > 5 ? 1 : trend < -5 ? 0.2 : 0.5;
    const scoreEficiencia = round2(clamp01((compComponent + cpcComponent + trendComponent) / 3));

    const { filtros, score_total } = scoreItem(item, ctx, knobs);

    if (knobs.intentFilter && name && negativeNames.has(name)) {
      return {
        item,
        classificacao: {
          tier: "negativar" as Tier,
          rotulo: TIER_LABELS.negativar,
          motivo: "Sem intenção comercial ligada ao nicho (gate de intenção).",
          score_value: scoreValue,
          score_eficiencia: scoreEficiencia,
          score_total,
          filtros,
        },
      };
    }

    const tier = tierForScore(score_total, knobs);
    const motivo = buildMotivo(score_total, filtros, volume);

    return {
      item,
      classificacao: {
        tier,
        rotulo: TIER_LABELS[tier],
        motivo,
        score_value: scoreValue,
        score_eficiencia: scoreEficiencia,
        score_total,
        filtros,
      },
    };
  });
}
```

- [ ] **Step 4: Adicionar imports de tipo**

Garantir que o topo de `keywordEvaluator.ts` importa `Classificacao` e `FiltroResultado`. O arquivo hoje declara `Classificacao` localmente (linhas 14-20) — substituir essa declaração local por import de `../types`:

Remover o bloco local:
```ts
export type Classificacao = {
  tier: Tier;
  rotulo: string;
  motivo: string;
  score_value: number;
  score_eficiencia: number;
};
```

E na linha 1, juntar ao import existente:
```ts
import { classifyKeywordIntent } from "./openRouter";
import type { Classificacao, FiltroResultado } from "../types";
```

Manter a re-exportação do tipo `Tier` e `TIER_LABELS` locais como estão (já existem). Se `Classificacao` era reexportada e algum arquivo a importa de `keywordEvaluator`, manter compat com:
```ts
export type { Classificacao } from "../types";
```

- [ ] **Step 5: Rodar testes e tipos**

Run (no diretório `frontend`):
```bash
npx vitest run keywordEvaluator && npx tsc --noEmit
```
Expected: testes PASS; `tsc` sem erros em todo o projeto.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/server/keywordEvaluator.ts frontend/lib/server/keywordEvaluator.test.ts
git commit -m "feat(evaluator): classify by weighted score instead of OR gate"
```

---

## Task 8: Verificação final

- [ ] **Step 1: Suite completa**

Run (no diretório `frontend`):
```bash
npx vitest run && npx tsc --noEmit
```
Expected: todos os testes PASS, zero erros de tipo.

- [ ] **Step 2: Build Next (sanidade)**

Run:
```bash
npx next build
```
Expected: build conclui sem erro. (Deploy continua pelo pipeline da main — não rodar `cf:build` local, ver memória do projeto.)

- [ ] **Step 3: Conferência manual rápida**

Confirmar no diff que:
- `classifyScope` não usa mais `compBaixa || cpcBaixo || trendUp`.
- `score_total` e `filtros` aparecem em toda `Classificacao` retornada.
- Knobs antigos (`pExcelente` etc.) ainda lidos, mas não usados na decisão de tier.

---

## Notas de verificação

- Sem `OPENROUTER_API_KEY`, o gate de intenção é pulado ([openRouter.ts:75](../../../frontend/lib/server/openRouter.ts#L75)) — testes rodam pela trilha de score.
- A tabela do front e o xlsx leem `score_value`/`score_eficiencia` (mantidos). `score_total`/`filtros` ficam disponíveis para exibição futura (fora do escopo deste plano).
