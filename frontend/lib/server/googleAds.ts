import { normalizeMonthlySearches } from "../googleColumns";

type GeoSuggestion = {
  id: string;
  name: string;
  country_code: string;
  target_type: string;
};

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

type AdsConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId: string;
  apiVersion: string;
  defaultLanguageId: string;
  includeAdultKeywords: boolean;
};

const GEO_FALLBACK: Record<string, string> = {
  "country:br": "21167",
  "country:brasil": "21167",
  "country:us": "2840",
  "country:united states": "2840",
  "country:pt": "2620",
  "country:portugal": "2620",
  "country:mx": "2484",
  "country:mexico": "2484",
  "state:sp": "21171",
  "state:rj": "21175",
  "state:mg": "21174",
  "city:sao paulo": "1031714",
  "city:são paulo": "1031714",
  "city:rio de janeiro": "1031745",
};

const TARGET_TYPES: Record<"city" | "state" | "country", Set<string>> = {
  city: new Set(["City", "Municipality"]),
  state: new Set(["State", "Province", "Region"]),
  country: new Set(["Country"]),
};

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number.parseInt(value.trim(), 10);
  return null;
}

function ptCompetition(value: string | null | undefined): string {
  const normalized = (value ?? "").toUpperCase();
  if (normalized === "LOW") return "Baixo";
  if (normalized === "MEDIUM") return "Médio";
  if (normalized === "HIGH") return "Alto";
  return "Desconhecido";
}

function monthLabel(month: string, year: number): string {
  const map: Record<string, string> = {
    JANUARY: "Janeiro",
    FEBRUARY: "Fevereiro",
    MARCH: "Março",
    APRIL: "Abril",
    MAY: "Maio",
    JUNE: "Junho",
    JULY: "Julho",
    AUGUST: "Agosto",
    SEPTEMBER: "Setembro",
    OCTOBER: "Outubro",
    NOVEMBER: "Novembro",
    DECEMBER: "Dezembro",
  };
  return `Searches: ${map[month.toUpperCase()] ?? month} ${year}`;
}

function percentage(current: number | null, prev: number | null): string | null {
  if (current === null || prev === null || prev === 0) return null;
  const pct = ((current - prev) / prev) * 100;
  return `${pct >= 0 ? "+" : ""}${Math.round(pct)}%`;
}

export function readAdsConfig(
  readEnv: (key: string) => string | undefined
): AdsConfig {
  return {
    clientId: readEnv("GOOGLE_ADS_CLIENT_ID") ?? "",
    clientSecret: readEnv("GOOGLE_ADS_CLIENT_SECRET") ?? "",
    refreshToken: readEnv("GOOGLE_ADS_REFRESH_TOKEN") ?? "",
    developerToken: readEnv("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "",
    customerId: (readEnv("GOOGLE_ADS_MCC_ID") ?? "").replace(/-/g, ""),
    loginCustomerId: (readEnv("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "").replace(/-/g, ""),
    apiVersion: readEnv("GOOGLE_ADS_API_VERSION") ?? "v20",
    defaultLanguageId: readEnv("GOOGLE_ADS_DEFAULT_LANGUAGE_ID") ?? "1000",
    includeAdultKeywords: parseBool(readEnv("GOOGLE_ADS_INCLUDE_ADULT_KEYWORDS"), true),
  };
}

function ensureConfig(config: AdsConfig): void {
  const missing = [
    ["GOOGLE_ADS_CLIENT_ID", config.clientId],
    ["GOOGLE_ADS_CLIENT_SECRET", config.clientSecret],
    ["GOOGLE_ADS_REFRESH_TOKEN", config.refreshToken],
    ["GOOGLE_ADS_DEVELOPER_TOKEN", config.developerToken],
    ["GOOGLE_ADS_MCC_ID", config.customerId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Google Ads nao configurado. Variaveis ausentes: ${missing.join(", ")}`);
  }
}

async function getAccessToken(config: AdsConfig): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao autenticar Google Ads: ${text}`);
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Resposta Google OAuth sem access_token.");
  }
  return data.access_token;
}

function adsHeaders(config: AdsConfig, token: string): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": config.developerToken,
    "Content-Type": "application/json",
  };
  if (config.loginCustomerId) {
    headers["login-customer-id"] = config.loginCustomerId;
  }
  return headers;
}

async function suggestGeo(
  config: AdsConfig,
  token: string,
  query: string,
  country: string,
  geoType: "city" | "state" | "country",
  limit = 12
): Promise<GeoSuggestion[]> {
  const url = `https://googleads.googleapis.com/${config.apiVersion}/geoTargetConstants:suggest`;
  const response = await fetch(url, {
    method: "POST",
    headers: adsHeaders(config, token),
    body: JSON.stringify({
      locale: "pt-BR",
      countryCode: country.toUpperCase(),
      locationNames: { names: [query] },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao buscar localizacoes no Google Ads: ${text}`);
  }
  const data = (await response.json()) as {
    geoTargetConstantSuggestions?: Array<{
      geoTargetConstant?: {
        id?: string | number;
        name?: string;
        countryCode?: string;
        targetType?: string;
        status?: string;
      };
    }>;
  };

  const allowed = TARGET_TYPES[geoType];
  const output: GeoSuggestion[] = [];
  const seen = new Set<string>();
  for (const row of data.geoTargetConstantSuggestions ?? []) {
    const geo = row.geoTargetConstant;
    if (!geo) continue;
    const id = String(geo.id ?? "").trim();
    const name = String(geo.name ?? "").trim();
    const targetType = String(geo.targetType ?? "").trim();
    const countryCode = String(geo.countryCode ?? "").trim().toUpperCase();
    const status = String(geo.status ?? "").trim().toUpperCase();
    if (!id || !name || !targetType) continue;
    if (status === "REMOVAL_PLANNED") continue;
    if (!allowed.has(targetType)) continue;
    const key = `${id}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ id, name, country_code: countryCode, target_type: targetType });
    if (output.length >= limit) break;
  }
  return output;
}

async function resolveLocationIds(
  config: AdsConfig,
  token: string,
  locations: string[],
  country: string
): Promise<string[]> {
  if (!locations.length) {
    if (country.toUpperCase() === "BR") return ["21167"];
    if (country.toUpperCase() === "US") return ["2840"];
    if (country.toUpperCase() === "PT") return ["2620"];
    if (country.toUpperCase() === "MX") return ["2484"];
    return ["21167"];
  }
  const ids: string[] = [];
  for (const raw of locations) {
    const value = raw.trim();
    const suffix = value.match(/#(\d+)$/);
    if (suffix?.[1]) {
      ids.push(suffix[1]);
      continue;
    }
    if (/^\d+$/.test(value)) {
      ids.push(value);
      continue;
    }
    const lower = value.toLowerCase();
    const fallback = GEO_FALLBACK[lower];
    if (fallback) {
      ids.push(fallback);
      continue;
    }
    const [prefix, labelRaw] = lower.split(":", 2);
    const label = (labelRaw ?? lower).split("#")[0].trim();
    if (!label) continue;
    const type = prefix === "state" || prefix === "country" ? prefix : "city";
    const suggested = await suggestGeo(config, token, label, country, type, 1);
    if (suggested[0]?.id) {
      ids.push(suggested[0].id);
    }
  }
  return ids.length ? ids : ["21167"];
}

export async function googleGeoSuggestions(params: {
  readEnv: (key: string) => string | undefined;
  query: string;
  country: string;
  geoType: "city" | "state" | "country";
  limit?: number;
}): Promise<GeoSuggestion[]> {
  const config = readAdsConfig(params.readEnv);
  ensureConfig(config);
  const token = await getAccessToken(config);
  return suggestGeo(
    config,
    token,
    params.query,
    params.country,
    params.geoType,
    params.limit ?? 12
  );
}

export async function googleKeywordSearchWithVariants(params: {
  readEnv: (key: string) => string | undefined;
  keywords: string[];
  country: string;
  limit: number;
  locations: string[];
}): Promise<{ items: SearchResultItem[]; closeVariants: string[] }> {
  const config = readAdsConfig(params.readEnv);
  ensureConfig(config);
  const token = await getAccessToken(config);
  const locationIds = await resolveLocationIds(config, token, params.locations, params.country);
  const endpoint = `https://googleads.googleapis.com/${config.apiVersion}/customers/${config.customerId}:generateKeywordIdeas`;

  const uniqueKeywords = Array.from(
    new Set(params.keywords.map((k) => k.trim()).filter(Boolean).map((k) => k.toLowerCase()))
  ).slice(0, 50);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: adsHeaders(config, token),
    body: JSON.stringify({
      language: `languageConstants/${config.defaultLanguageId}`,
      geoTargetConstants: locationIds.map((id) => `geoTargetConstants/${id}`),
      keywordSeed: { keywords: uniqueKeywords },
      includeAdultKeywords: config.includeAdultKeywords,
      keywordPlanNetwork: "GOOGLE_SEARCH_AND_PARTNERS",
      pageSize: Math.min(Math.max(params.limit, 1), 100),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Ads retornou erro na busca: ${text}`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      text?: string;
      closeVariants?: string[];
      keywordIdeaMetrics?: {
        avgMonthlySearches?: number | string;
        competition?: string;
        competitionIndex?: number | string;
        lowTopOfPageBidMicros?: number | string;
        highTopOfPageBidMicros?: number | string;
        monthlySearchVolumes?: Array<{
          year?: number | string;
          month?: string;
          monthlySearches?: number | string;
        }>;
      };
    }>;
  };

  const output: SearchResultItem[] = [];
  const closeVariants: string[] = [];
  let i = 0;
  for (const item of data.results ?? []) {
    i += 1;
    const text = String(item.text ?? "").trim();
    if (!text) continue;
    for (const variant of item.closeVariants ?? []) {
      const cleaned = String(variant).trim();
      if (cleaned) closeVariants.push(cleaned);
    }
    const metrics = item.keywordIdeaMetrics ?? {};
    const monthlyRaw = metrics.monthlySearchVolumes ?? [];
    const monthlyParsed = monthlyRaw
      .map((m) => {
        const y = toInt(m.year);
        const month = String(m.month ?? "").toUpperCase();
        const val = toInt(m.monthlySearches);
        if (!y || !month || val === null) return null;
        const monthOrder: Record<string, number> = {
          JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
          JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
        };
        const order = monthOrder[month];
        if (!order) return null;
        return { key: y * 100 + order, label: monthLabel(month, y), value: val };
      })
      .filter((x): x is { key: number; label: string; value: number } => Boolean(x))
      .sort((a, b) => a.key - b.key)
      .slice(-12);

    const monthly = normalizeMonthlySearches(
      Object.fromEntries(monthlyParsed.map((row) => [row.label, row.value]))
    );
    const values = Object.values(monthly);
    const current = values.at(-1) ?? null;
    const before3 = values.length >= 4 ? values.at(-4) ?? null : null;
    const yearAgo = values.length >= 12 ? values.at(-12) ?? null : null;
    const competition = String(metrics.competition ?? "");
    const competitionIndex = toInt(metrics.competitionIndex);
    const lowBid = toInt(metrics.lowTopOfPageBidMicros);
    const highBid = toInt(metrics.highTopOfPageBidMicros);

    output.push({
      id: `google_kw_${i}_${text.slice(0, 40)}`,
      name: text,
      audience_size: toInt(metrics.avgMonthlySearches),
      type: ptCompetition(competition),
      path: (item.closeVariants ?? []).slice(0, 3).map((v) => `Variant: ${v}`),
      media_pesquisas: toInt(metrics.avgMonthlySearches),
      mudanca_tres_meses: percentage(current, before3),
      mudanca_ano_anterior: percentage(current, yearAgo),
      concorrencia: ptCompetition(competition),
      grau_concorrencia: competitionIndex,
      menor_lance_topo: lowBid !== null ? lowBid / 1_000_000 : null,
      maior_lance_topo: highBid !== null ? highBid / 1_000_000 : null,
      searches_mensais: monthly,
    });
  }

  return { items: output, closeVariants };
}

export async function googleKeywordSearch(params: {
  readEnv: (key: string) => string | undefined;
  keywords: string[];
  country: string;
  limit: number;
  locations: string[];
}): Promise<SearchResultItem[]> {
  const { items } = await googleKeywordSearchWithVariants(params);
  return items;
}
