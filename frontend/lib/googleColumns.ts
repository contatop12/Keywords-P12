export const GOOGLE_YOY_LABEL =
  "Mudança em relação ao mesmo mês do ano anterior (março/25 e 26)";

export const GOOGLE_STATIC_HEADERS = [
  "Palavra-Chave",
  "Média de Pesquisas",
  "Mudança em três meses",
  GOOGLE_YOY_LABEL,
  "Concorrência",
  "Grau de concorrência",
  "Menores valores para aparecer no topo da pesquisa",
  "Maiores valores para aparecer no topo da pesquisa",
] as const;

export const GOOGLE_MONTH_COLUMNS = [
  "Searches: Abril 2025",
  "Searches: Maio 2025",
  "Searches: Junho 2025",
  "Searches: Julho 2025",
  "Searches: Agosto 2025",
  "Searches: Setembro 2025",
  "Searches: Outubro 2025",
  "Searches: Novembro 2025",
  "Searches: Dezembro 2025",
  "Searches: Janeiro 2026",
  "Searches: Fevereiro 2026",
  "Searches: Março 2026",
] as const;

export type GoogleTableColumn = { key: string; label: string };

export function buildGoogleTableColumns(): GoogleTableColumn[] {
  return [
    { key: "name", label: "Palavra-Chave" },
    { key: "media_pesquisas", label: "Média de Pesquisas" },
    { key: "mudanca_tres_meses", label: "Mudança em três meses" },
    { key: "mudanca_ano_anterior", label: GOOGLE_YOY_LABEL },
    { key: "concorrencia", label: "Concorrência" },
    { key: "grau_concorrencia", label: "Grau de concorrência" },
    { key: "menor_lance_topo", label: "Menores valores para aparecer no topo da pesquisa" },
    { key: "maior_lance_topo", label: "Maiores valores para aparecer no topo da pesquisa" },
    ...GOOGLE_MONTH_COLUMNS.map((label) => ({ key: `month:${label}`, label })),
  ];
}

export function normalizeMonthlySearches(raw?: Record<string, number>): Record<string, number> {
  const source = raw ?? {};
  const output: Record<string, number> = {};
  for (const label of GOOGLE_MONTH_COLUMNS) {
    if (label in source) {
      output[label] = source[label];
    }
  }
  return output;
}

export function splitGoogleKeywords(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
