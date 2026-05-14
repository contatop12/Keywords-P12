import { SearchPayload, SearchResponse, StudyMeta, StudyResult } from "./types";

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

export async function generateStudy(payload: {
  keywords: string[];
  locations: string[];
  country: string;
  limit: number;
}): Promise<StudyResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/google/study`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`Nao foi possivel conectar ao backend em ${API_BASE_URL}.`);
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Erro ao gerar estudo." }));
    throw new Error(err?.detail ?? "Erro ao gerar estudo.");
  }
  return response.json() as Promise<StudyResult>;
}

export async function downloadStudyXlsx(study: StudyResult): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/google/study/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(study),
  });
  if (!response.ok) throw new Error("Erro ao gerar XLSX.");
  return response.blob();
}

export async function listStudies(): Promise<StudyMeta[]> {
  const res = await fetch("/api/studies");
  if (!res.ok) return [];
  return res.json();
}

export async function saveStudy(study: StudyResult, name?: string): Promise<void> {
  await fetch("/api/studies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...study, name: name ?? null }),
  });
}

export async function loadStudy(id: string): Promise<StudyResult> {
  const res = await fetch(`/api/studies/${id}`);
  if (!res.ok) throw new Error("Estudo nao encontrado.");
  return res.json();
}

export async function deleteStudy(id: string): Promise<void> {
  await fetch(`/api/studies/${id}`, { method: "DELETE" });
}
