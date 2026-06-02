import { classifyKeywordIntent } from "./openRouter";
import type { Classificacao, FiltroResultado } from "../types";

export type { Classificacao } from "../types";

type ReadEnv = (key: string) => string | undefined;

export type Tier = "oportunidade_excelente" | "otimo" | "talvez" | "negativar";

export const TIER_LABELS: Record<Tier, string> = {
  oportunidade_excelente: "Oportunidade Excelente",
  otimo: "Ótimo",
  talvez: "Talvez",
  negativar: "Negativar",
};

type Item = Record<string, unknown>;

export type Resumo = Record<Tier, number>;

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

function num(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function readKnobs(readEnv: ReadEnv): Knobs {
  const scopeRaw = (readEnv("EVALUATOR_SCOPE") ?? "per_tab").trim().toLowerCase();
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
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parsePercent(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "—" || s === "--") return null;
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number.parseFloat(m[0].replace(",", "")) : null;
}

function volumeOf(item: Item): number {
  return toNumber(item.media_pesquisas) ?? toNumber(item.audience_size) ?? 0;
}

function cpcOf(item: Item): number | null {
  return toNumber(item.maior_lance_topo);
}

function gradeOf(item: Item): number | null {
  return toNumber(item.grau_concorrencia);
}

function trendOf(item: Item): number | null {
  const a = parsePercent(item.mudanca_tres_meses);
  const b = parsePercent(item.mudanca_ano_anterior);
  if (a == null && b == null) return null;
  return Math.max(a ?? Number.NEGATIVE_INFINITY, b ?? Number.NEGATIVE_INFINITY);
}

// Percentil (0..1) de cada valor dentro do array: fração de valores estritamente menores.
function percentileMap(values: number[]): (v: number) => number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return (v: number) => {
    if (n <= 1) return 0.5;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo / (n - 1);
  };
}

function median(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function emptyResumo(): Resumo {
  return { oportunidade_excelente: 0, otimo: 0, talvez: 0, negativar: 0 };
}

export function tierForScore(score: number, knobs: Knobs): Tier {
  if (score >= knobs.tierExcelente) return "oportunidade_excelente";
  if (score >= knobs.tierOtimo) return "otimo";
  if (score >= knobs.tierTalvez) return "talvez";
  return "negativar";
}

export type ScopeCtx = { cpcMedian: number | null };

// Soma ponderada de 7 filtros. Filtro sem dado é excluído do denominador
// (não pune a palavra), então score = pesoObtido / pesoDisponível.
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

export function buildMotivo(score: number, filtros: FiltroResultado[], volume: number): string {
  const aprovados = filtros.filter((f) => f.ok).map((f) => f.nome.toLowerCase());
  if (!aprovados.length) {
    return `Score ${score.toFixed(2)} — nenhum sinal forte (${Math.round(volume)} buscas/mês).`;
  }
  return `Score ${score.toFixed(2)} — ${aprovados.join(", ")}.`;
}

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

async function resolveNegatives(
  readEnv: ReadEnv,
  knobs: Knobs,
  names: string[],
  seeds: string[],
  niche: string
): Promise<Set<string>> {
  if (!knobs.intentFilter || !names.length) return new Set();
  const flagged = await classifyKeywordIntent(readEnv, names, seeds, niche);
  return new Set(Object.keys(flagged).filter((k) => flagged[k]));
}

export async function evaluateItems(
  readEnv: ReadEnv,
  items: Item[],
  seeds: string[],
  niche: string
): Promise<{ items: Item[]; resumo: Resumo }> {
  const knobs = readKnobs(readEnv);
  const names = items.map((it) => String(it.name ?? "").trim()).filter(Boolean);
  const negatives = await resolveNegatives(readEnv, knobs, names, seeds, niche);

  const resumo = emptyResumo();
  const classified = classifyScope(items, knobs, negatives).map(({ item, classificacao }) => {
    resumo[classificacao.tier] += 1;
    return { ...item, classificacao };
  });

  return { items: classified, resumo };
}

export async function evaluateTabs(
  readEnv: ReadEnv,
  tabs: Array<{ name?: string; seeds?: string[]; items?: Item[] }>,
  seeds: string[],
  niche: string
): Promise<{ tabs: Array<{ name: string; seeds: string[]; items: Item[] }>; resumo: Resumo }> {
  const knobs = readKnobs(readEnv);
  const resumo = emptyResumo();

  // Gate de intenção: per_tab roda por aba; global junta todos os nomes numa chamada.
  let globalNegatives: Set<string> | null = null;
  if (knobs.scope === "global") {
    const allNames = Array.from(
      new Set(
        tabs.flatMap((t) => (t.items ?? []).map((it) => String(it.name ?? "").trim())).filter(Boolean)
      )
    );
    globalNegatives = await resolveNegatives(readEnv, knobs, allNames, seeds, niche);
  }

  const outTabs: Array<{ name: string; seeds: string[]; items: Item[] }> = [];
  for (const tab of tabs) {
    const tabItems = (tab.items ?? []) as Item[];
    const tabSeeds = tab.seeds ?? [];
    const negatives =
      globalNegatives ??
      (await resolveNegatives(
        readEnv,
        knobs,
        tabItems.map((it) => String(it.name ?? "").trim()).filter(Boolean),
        tabSeeds.length ? tabSeeds : seeds,
        niche
      ));

    const classified = classifyScope(tabItems, knobs, negatives).map(({ item, classificacao }) => {
      resumo[classificacao.tier] += 1;
      return { ...item, classificacao };
    });

    outTabs.push({ name: tab.name ?? "Aba", seeds: tabSeeds, items: classified });
  }

  return { tabs: outTabs, resumo };
}
