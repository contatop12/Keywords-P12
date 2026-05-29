import { classifyKeywordIntent } from "./openRouter";

type ReadEnv = (key: string) => string | undefined;

export type Tier = "oportunidade_excelente" | "otimo" | "talvez" | "negativar";

export const TIER_LABELS: Record<Tier, string> = {
  oportunidade_excelente: "Oportunidade Excelente",
  otimo: "Ótimo",
  talvez: "Talvez",
  negativar: "Negativar",
};

export type Classificacao = {
  tier: Tier;
  rotulo: string;
  motivo: string;
  score_value: number;
  score_eficiencia: number;
};

type Item = Record<string, unknown>;

export type Resumo = Record<Tier, number>;

type Knobs = {
  enabled: boolean;
  intentFilter: boolean;
  scope: "per_tab" | "global";
  minVolume: number;
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

  return items.map((item) => {
    const name = String(item.name ?? "").trim();
    const volume = volumeOf(item);
    const grade = gradeOf(item);
    const cpc = cpcOf(item);
    const trend = trendOf(item);

    const scoreValue = round2(clamp01(volPct(volume)));

    const compComponent = grade != null ? 1 - clamp01(grade / 100) : 0.4;
    const cpcComponent = cpc != null && cpcPct ? 1 - clamp01(cpcPct(cpc)) : 0.5;
    const trendComponent = trend == null ? 0.5 : trend > 5 ? 1 : trend < -5 ? 0.2 : 0.5;
    const scoreEficiencia = round2(clamp01((compComponent + cpcComponent + trendComponent) / 3));

    if (knobs.intentFilter && name && negativeNames.has(name)) {
      return {
        item,
        classificacao: {
          tier: "negativar" as Tier,
          rotulo: TIER_LABELS.negativar,
          motivo: "Sem intenção comercial ligada ao nicho (gate de intenção).",
          score_value: scoreValue,
          score_eficiencia: scoreEficiencia,
        },
      };
    }

    const compBaixa = grade != null && grade <= knobs.compBaixaMax;
    const compAlta = grade != null && grade >= knobs.compAltaMin;
    const cpcBaixo = cpc != null && cpcMedian != null && cpc <= cpcMedian;
    const trendUp = trend != null && trend > 5;
    const temAlcance = volume >= knobs.minVolume;

    let tier: Tier;
    let motivo: string;

    if (temAlcance && (compBaixa || cpcBaixo || trendUp) && scoreEficiencia >= knobs.pExcelente) {
      tier = "oportunidade_excelente";
      const fatores: string[] = [];
      if (compBaixa) fatores.push("concorrência baixa");
      if (cpcBaixo) fatores.push("CPC baixo");
      if (trendUp) fatores.push("tendência em alta");
      motivo = `Relevante, com alcance (${Math.round(volume)} buscas/mês) e ${fatores.join(", ")}.`;
    } else if (scoreValue >= knobs.pOtimo || (temAlcance && !compAlta)) {
      tier = "otimo";
      motivo =
        scoreValue >= knobs.pOtimo
          ? `Núcleo sólido por volume (${Math.round(volume)} buscas/mês).`
          : `Volume relevante (${Math.round(volume)} buscas/mês) sem concorrência alta.`;
    } else {
      tier = "talvez";
      motivo = temAlcance
        ? "Relevante porém cara/disputada sem destaque de eficiência."
        : `Sinal fraco / baixo volume (${Math.round(volume)} buscas/mês).`;
    }

    return {
      item,
      classificacao: {
        tier,
        rotulo: TIER_LABELS[tier],
        motivo,
        score_value: scoreValue,
        score_eficiencia: scoreEficiencia,
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
