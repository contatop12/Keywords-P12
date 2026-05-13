import { SearchPayload, SearchResponse } from "./types";

const DEFAULT_API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://keywords-p12-api.fly.dev"
    : "http://localhost:8011";

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
      `Nao foi possivel conectar ao backend em ${API_BASE_URL}. Inicie a API FastAPI antes da busca.`
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

export async function searchGoogleKeywords(payload: SearchPayload): Promise<SearchResponse> {
  return executeSearch("/api/google/search", payload, "Google Ads");
}
