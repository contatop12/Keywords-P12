import { googleKeywordSearchWithVariants } from "./googleAds";
import { categorizeKeywords } from "./openRouter";

type ReadEnv = (key: string) => string | undefined;

type SearchResultItem = {
  id: string;
  name: string;
  audience_size: number | null;
  type: string | null;
  path: string[];
  media_pesquisas?: number | null;
  mudanca_tres_meses?: string | null;
  mudanca_ano_anterior?: string | null;
  concorrencia?: string | null;
  grau_concorrencia?: number | null;
  menor_lance_topo?: number | null;
  maior_lance_topo?: number | null;
  searches_mensais?: Record<string, number>;
};

const STOPWORDS = new Set([
  "a",
  "as",
  "ao",
  "aos",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "sem",
  "um",
  "uma",
  "uns",
  "umas",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .match(/[a-zà-ú0-9]+/g)
    ?.filter((token) => token.length >= 4 && !STOPWORDS.has(token)) ?? [];
}

function buildBroadenSuggestions(
  seedKeywords: string[],
  items: SearchResultItem[],
  closeVariants: string[]
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const push = (value: string) => {
    const cleaned = value.trim();
    if (cleaned.length < 4) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(cleaned);
  };

  for (const variant of closeVariants) push(variant);
  for (const seed of seedKeywords) {
    push(seed);
    for (const token of tokenize(seed)) {
      if (token.length >= 6) push(token);
    }
  }

  return ordered.slice(0, 8);
}

const RELEVANCE_THRESHOLD = 0.38;

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function relevanceScore(seed: string, name: string): number {
  const keyword = normalizeText(seed);
  const target = normalizeText(name);
  if (!keyword || !target) return 0;
  if (target.includes(keyword)) return 1;

  const kwTokens = keyword.match(/[a-z0-9]{2,}/g) ?? [];
  const targetTokens = new Set(target.match(/[a-z0-9]{2,}/g) ?? []);
  if (!kwTokens.length || !targetTokens.size) return 0;

  const overlap = kwTokens.filter((token) => targetTokens.has(token)).length / kwTokens.length;
  return overlap;
}

function filterItemsToSeeds(items: SearchResultItem[], seeds: string[]): SearchResultItem[] {
  if (!items.length || !seeds.length) return items;
  const kept = new Map<string, SearchResultItem>();
  for (const seed of seeds) {
    for (const item of items) {
      if (relevanceScore(seed, item.name) >= RELEVANCE_THRESHOLD) {
        kept.set(item.id, item);
      }
    }
  }
  return kept.size ? Array.from(kept.values()) : items;
}

function dedupeItems(items: SearchResultItem[]): SearchResultItem[] {
  const seen = new Set<string>();
  const output: SearchResultItem[] = [];
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

export async function runGoogleDiscovery(params: {
  readEnv: ReadEnv;
  keywords: string[];
  country: string;
  limit: number;
  locations: string[];
}) {
  const { items, closeVariants } = await googleKeywordSearchWithVariants(params);
  const general = filterItemsToSeeds(dedupeItems(items), params.keywords);
  const keywordNames = general.map((item) => item.name);

  let categories: Record<string, SearchResultItem[]> = {};
  try {
    const categoriesMap = await categorizeKeywords(params.readEnv, keywordNames, params.keywords);
    const nameToItem = new Map(general.map((item) => [item.name.toLowerCase(), item]));
    for (const [category, names] of Object.entries(categoriesMap)) {
      const bucket = names
        .map((name) => nameToItem.get(name.toLowerCase()))
        .filter((item): item is SearchResultItem => Boolean(item));
      if (bucket.length > 0) {
        categories[category] = bucket;
      }
    }
  } catch {
    categories = {};
  }

  return {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    seed_keywords: params.keywords,
    locations: params.locations,
    country: params.country,
    general,
    categories,
    broaden_suggestions: buildBroadenSuggestions(params.keywords, general, closeVariants),
    results: general,
  };
}
