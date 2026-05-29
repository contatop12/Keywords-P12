import {
  AgebriResult,
  BriefingData,
  ClientProfile,
  ClientProfileIndexEntry,
  DiscoveryResult,
  GeoSuggestionItem,
  SearchPayload,
  SearchResponse,
  Structure,
  StructureIndexEntry,
} from "./types";

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

// ── Agente de Análise (classificação de keywords) ──────────────────────────

export type EvaluateTier = "oportunidade_excelente" | "otimo" | "talvez" | "negativar";

export interface EvaluatedTab {
  name: string;
  seeds: string[];
  items: Record<string, unknown>[];
}

export interface EvaluateResponse {
  tabs: EvaluatedTab[];
  resumo: Record<EvaluateTier, number>;
  labels: Record<EvaluateTier, string>;
}

export async function evaluateKeywords(params: {
  tabs: { name: string; seeds: string[]; items: Record<string, unknown>[] }[];
  seeds: string[];
  niche: string;
}): Promise<EvaluateResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/google/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    throw new Error("Nao foi possivel conectar ao avaliador de palavras-chave.");
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Erro ao avaliar palavras-chave." }));
    throw new Error(err?.detail ?? "Erro ao avaliar palavras-chave.");
  }
  return (await response.json()) as EvaluateResponse;
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

export async function downloadClassifiedXlsx(study: {
  tabs: { name: string; items: Record<string, unknown>[] }[];
}): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/google/study/export-classified`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(study),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Erro ao gerar XLSX classificado." }));
    throw new Error(err?.detail ?? "Erro ao gerar XLSX classificado.");
  }
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
  const res = await fetch("/api/studies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ study, client_name: clientName, brief_preview: briefPreview, brief }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro ao salvar estudo." }));
    throw new Error((err as { error?: string }).error ?? "Erro ao salvar estudo.");
  }
}

export async function listStudies(): Promise<StudyIndexEntry[]> {
  const res = await fetch("/api/studies");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro ao carregar histórico." }));
    throw new Error((err as { error?: string }).error ?? "Erro ao carregar histórico.");
  }
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

// ── Perfis de Cliente ───────────────────────────────────────────────────────

export async function listClients(): Promise<ClientProfileIndexEntry[]> {
  const res = await fetch("/api/clients");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro ao carregar clientes." }));
    throw new Error((err as { error?: string }).error ?? "Erro ao carregar clientes.");
  }
  return (await res.json()) as ClientProfileIndexEntry[];
}

export async function getClient(id: string): Promise<ClientProfile | null> {
  const res = await fetch(`/api/clients/${id}`);
  if (!res.ok) return null;
  return (await res.json()) as ClientProfile;
}

export async function saveClient(
  profile: Partial<ClientProfile>
): Promise<{ ok: boolean; id: string }> {
  const isUpdate = Boolean(profile.id);
  const res = await fetch(isUpdate ? `/api/clients/${profile.id}` : "/api/clients", {
    method: isUpdate ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro ao salvar cliente." }));
    throw new Error((err as { error?: string }).error ?? "Erro ao salvar cliente.");
  }
  return (await res.json()) as { ok: boolean; id: string };
}

export async function deleteClient(id: string): Promise<void> {
  await fetch(`/api/clients/${id}`, { method: "DELETE" });
}

// ── Criador de Estrutura + Estruturas ────────────────────────────────────────

export async function buildCampaign(params: {
  tabs: { name: string; items: Record<string, unknown>[] }[];
  clientProfileId?: string;
  clientProfile?: ClientProfile;
}): Promise<Structure> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/google/build-campaign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, objetivo: "search" }),
    });
  } catch {
    throw new Error("Nao foi possivel conectar ao criador de estrutura.");
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Erro ao montar estrutura." }));
    throw new Error(err?.detail ?? "Erro ao montar estrutura.");
  }
  return (await response.json()) as Structure;
}

export async function listStructures(): Promise<StructureIndexEntry[]> {
  const res = await fetch("/api/structures");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro ao carregar estruturas." }));
    throw new Error((err as { error?: string }).error ?? "Erro ao carregar estruturas.");
  }
  return (await res.json()) as StructureIndexEntry[];
}

export async function getStructure(id: string): Promise<Structure | null> {
  const res = await fetch(`/api/structures/${id}`);
  if (!res.ok) return null;
  return (await res.json()) as Structure;
}

export async function saveStructure(structure: Structure): Promise<{ ok: boolean; id: string }> {
  const res = await fetch("/api/structures", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(structure),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro ao salvar estrutura." }));
    throw new Error((err as { error?: string }).error ?? "Erro ao salvar estrutura.");
  }
  return (await res.json()) as { ok: boolean; id: string };
}

export async function updateStructure(
  id: string,
  patch: Partial<Structure>
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`/api/structures/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro ao atualizar estrutura." }));
    throw new Error((err as { error?: string }).error ?? "Erro ao atualizar estrutura.");
  }
  return (await res.json()) as { ok: boolean; id: string };
}

export async function deleteStructure(id: string): Promise<void> {
  await fetch(`/api/structures/${id}`, { method: "DELETE" });
}

export async function exportMultiStudyToSheets(study: MultiStudyResult): Promise<{ url: string }> {
  const url = "/api/google/study/export-sheets";
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ study }),
    });
  } catch {
    throw new Error("Nao foi possivel conectar ao servidor de exportacao Google Sheets.");
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Erro ao exportar para Google Sheets." }));
    throw new Error(err?.detail ?? "Erro ao exportar para Google Sheets.");
  }
  return (await response.json()) as { url: string };
}
