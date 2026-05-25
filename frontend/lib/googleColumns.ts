export const GOOGLE_YOY_LABEL = "Mudança em relação ao mesmo mês do ano anterior";

const PT_MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

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

function buildMonthColumns(): string[] {
  const now = new Date();
  const cols: string[] = [];
  for (let offset = 11; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    cols.push(`Searches: ${PT_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`);
  }
  return cols;
}

export const GOOGLE_MONTH_COLUMNS = buildMonthColumns();

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
  return raw ? { ...raw } : {};
}

export function splitGoogleKeywords(raw: string): string[] {
  return raw
    .split(/[,;\r\n]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
