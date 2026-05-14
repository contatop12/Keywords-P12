import { DiscoveryResult, GeoSuggestionItem, SearchPayload, SearchResponse } from "./types";

const DEFAULT_API_BASE_URL = process.env.NODE_ENV === "production" ? "" : "http://localhost:8011";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

async function executeSearch(
  endpoint: string,
  payload: SearchPayload,
  providerLabel: string
): Promise<SearchResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error(
      `Nao foi possivel conectar ao backend em ${API_BASE_URL || "mesma origem"}.`
    );
  }

  if (!response.ok) {
    const maybeJson = await response
      .json()
      .catch(() => ({ detail: `Falha inesperada na busca ${providerLabel}.` }));
    const detail = maybeJson?.detail ?? `Falha inesperada na busca ${providerLabel}.`;
    throw new Error(detail);
  }

  return (await response.json()) as SearchResponse;
}

export async function searchMetaInterests(payload: SearchPayload): Promise<SearchResponse> {
  return executeSearch("/api/meta/search", payload, "Meta");
}

export async function searchGoogleDiscovery(payload: SearchPayload): Promise<DiscoveryResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/google/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`Nao foi possivel conectar ao backend em ${API_BASE_URL || "mesma origem"}.`);
  }

  if (!response.ok) {
    const maybeJson = await response
      .json()
      .catch(() => ({ detail: "Falha inesperada na busca Google Ads." }));
    const detail = maybeJson?.detail ?? "Falha inesperada na busca Google Ads.";
    throw new Error(detail);
  }

  return (await response.json()) as DiscoveryResult;
}

export async function suggestGoogleLocations(payload: {
  query: string;
  country: string;
  geo_type: "city" | "state" | "country";
  limit?: number;
}): Promise<GeoSuggestionItem[]> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/google/geo/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`Nao foi possivel conectar ao backend em ${API_BASE_URL || "mesma origem"}.`);
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Erro ao buscar localizacoes." }));
    throw new Error(err?.detail ?? "Erro ao buscar localizacoes.");
  }
  const data = (await response.json()) as { results: GeoSuggestionItem[] };
  return data.results ?? [];
}

export async function downloadDiscoveryXlsx(discovery: DiscoveryResult): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/google/discovery/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(discovery),
  });
  if (!response.ok) throw new Error("Erro ao gerar XLSX.");
  return response.blob();
}
