import { AgebriResult, BriefingData, DiscoveryResult, GeoSuggestionItem, SearchPayload, SearchResponse } from "./types";

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

export interface MultiTabSpec {
  name: string;
  seeds: string[];
  locations?: string[];
  country?: string;
  limit?: number;
}

export interface MultiStudyPayload {
  tabs: MultiTabSpec[];
  locations: string[];
  country: string;
  limit: number;
}

export interface MultiTabResult {
  name: string;
  seeds: string[];
  items: Record<string, unknown>[];
  error?: string;
}

export interface MultiStudyResult {
  id: string;
  created_at: string;
  country: string;
  default_locations: string[];
  tabs: MultiTabResult[];
}

export async function generateMultiStudy(payload: MultiStudyPayload): Promise<MultiStudyResult> {
  // Sempre usa a rota Next.js (batching de seeds na API Google Ads).
  const url = "/api/google/multi-study";
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Nao foi possivel conectar ao servidor de estudos multi-aba.");
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Erro ao gerar estudo multi-aba." }));
    throw new Error(err?.detail ?? "Erro ao gerar estudo multi-aba.");
  }
  return (await response.json()) as MultiStudyResult;
}

export interface PlanBriefPayload {
  cliente: string;
  especialidade: string;
  urls: string[];
  localizacao: string;
  objetivo: string;
  servicos: string[];
  concorrentes: string[];
  observacoes: string;
  negativar: string;
}

export interface PlanCluster {
  nome: string;
  intencao: "alta" | "media" | "baixa";
  prioridade: number;
  seeds: string[];
  observacao: string;
}

export interface PlanResult {
  estrategia: string;
  clusters: PlanCluster[];
}

export async function planKeywords(payload: PlanBriefPayload): Promise<PlanResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/google/plan-keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`Nao foi possivel conectar ao backend em ${API_BASE_URL || "mesma origem"}.`);
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Erro ao gerar plano de keywords." }));
    throw new Error(err?.detail ?? "Erro ao gerar plano de keywords.");
  }
  return (await response.json()) as PlanResult;
}

export async function downloadMultiStudyXlsx(study: MultiStudyResult): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/google/study/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(study),
  });
  if (!response.ok) throw new Error("Erro ao gerar XLSX.");
  return response.blob();
}

export async function runAgebri(briefing: BriefingData): Promise<AgebriResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/google/agebri`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(briefing),
    });
  } catch {
    throw new Error(`Nao foi possivel conectar ao backend em ${API_BASE_URL || "mesma origem"}.`);
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Erro ao consultar AGEBRI." }));
    throw new Error(err?.detail ?? "Erro ao consultar AGEBRI.");
  }
  return (await response.json()) as AgebriResult;
}

// ── Study history (Cloudflare KV) ──────────────────────────────────────────

export interface StudyIndexEntry {
  id: string;
  created_at: string;
  client_name: string;
  brief_preview: string;
  tab_count: number;
  keyword_count: number;
}

export interface StoredStudy extends MultiStudyResult {
  client_name: string;
  brief_preview: string;
  brief: PlanBriefPayload;
}

export async function saveStudy(
  study: MultiStudyResult,
  clientName: string,
  briefPreview: string,
  brief: PlanBriefPayload
): Promise<void> {
  await fetch("/api/studies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ study, client_name: clientName, brief_preview: briefPreview, brief }),
  });
}

export async function listStudies(): Promise<StudyIndexEntry[]> {
  const res = await fetch("/api/studies");
  if (!res.ok) return [];
  return (await res.json()) as StudyIndexEntry[];
}

export async function getStudy(id: string): Promise<StoredStudy | null> {
  const res = await fetch(`/api/studies/${id}`);
  if (!res.ok) return null;
  return (await res.json()) as StoredStudy;
}

export async function deleteStudy(id: string): Promise<void> {
  await fetch(`/api/studies/${id}`, { method: "DELETE" });
}

export async function exportMultiStudyToSheets(study: MultiStudyResult): Promise<{ url: string }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/google/study/export-sheets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ study }),
    });
  } catch {
    throw new Error(`Nao foi possivel conectar ao backend em ${API_BASE_URL || "mesma origem"}.`);
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Erro ao exportar para Google Sheets." }));
    throw new Error(err?.detail ?? "Erro ao exportar para Google Sheets.");
  }
  return (await response.json()) as { url: string };
}
