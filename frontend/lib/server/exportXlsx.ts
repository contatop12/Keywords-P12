import * as XLSX from "xlsx";

const PT_MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const FIXED_NEGATIVAS: [string, string][] = [
  ["GERAL", ""],
  ["Convênios", "amil, bradesco saude, unimed, sulamerica, porto seguro, cassi, geap, plano de saude, convenio, aceita convenio, reembolso (se não trabalhar com reembolso)."],
  ["Geral/Financeiro", "[gratis], [gratuito], [online], [cotação], [preço], [quanto custa] (se não quiser atrair diretamente por preço), [barato], [desconto] (à exceção dos convênios), [promocao], [convênio] [publico] [SUS]"],
  ["Tipo de Serviço (médico não odontológico)", ""],
  ["Aparelhos/Venda/Conserto", "[aparelhos], [maquinas], [equipamentos], [comprar], [venda], [alugar], [conserto], [manutencao], [pecas]"],
  ["Cursos/Profissional", "[curso], [faculdade], [graduação], [pos], [especialização], [profissionais], [aprender], [livro], [vaga], [emprego], [carreira], [salario]"],
  ["Geral irrelevante", "[fotos], [imagens], [wiki], [youtube], [filme], [serie], [download], [pdf], [videos], [blog], [forum], [artigo], [noticias]"],
];

const INVALID_CHARS = /[\\/*?:[\]]/g;

function safeTitle(name: string, used: Set<string>): string {
  const base = (name.replace(INVALID_CHARS, " ").trim() || "Aba").slice(0, 31);
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = ` (${n++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate);
  return candidate;
}

function monthYear(createdAt: string | undefined): [string, number] {
  const d = createdAt ? new Date(createdAt) : new Date();
  const valid = isNaN(d.getTime()) ? new Date() : d;
  return [PT_MONTHS[valid.getMonth()], valid.getFullYear()];
}

function monthColumns(refMonth: string, refYear: number): string[] {
  const idx = PT_MONTHS.indexOf(refMonth);
  if (idx < 0) return [];
  const seq: [string, number][] = [];
  let m = idx;
  let y = refYear;
  for (let i = 0; i < 12; i++) {
    seq.push([PT_MONTHS[m], y]);
    if (--m < 0) { m = 11; y--; }
  }
  return seq.reverse().map(([mn, yr]) => `Searches: ${mn} ${yr}`);
}

function locationLabel(locations: string[], country: string): string {
  const first = (locations[0] ?? "").trim().replace(/^(city|state|country):/i, "").split("#")[0].trim();
  if (first) return `Local: ${first.charAt(0).toUpperCase()}${first.slice(1)}`;
  return country ? `Local: ${country.toUpperCase()}` : "Local: -";
}

type Item = Record<string, unknown>;

function dataRow(item: Item, mCols: string[]): unknown[] {
  const monthly = (item.searches_mensais as Record<string, number> | undefined) ?? {};
  return [
    item.name ?? "",
    item.media_pesquisas ?? null,
    item.mudanca_tres_meses ?? "--",
    item.mudanca_ano_anterior ?? "--",
    item.concorrencia ?? "Desconhecido",
    item.grau_concorrencia ?? null,
    item.menor_lance_topo ?? null,
    item.maior_lance_topo ?? null,
    ...mCols.map((c) => monthly[c] ?? null),
  ];
}

function buildDataSheet(
  items: Item[],
  seeds: string[],
  locLabel: string,
  mName: string,
  year: number,
): XLSX.WorkSheet {
  const mCols = monthColumns(mName, year);
  const yoyShort = (y: number) =>
    `${mName.slice(0, 5).toLowerCase()}/${String(y).slice(-2)}`;

  const headers = [
    "Palavra-Chave",
    "Média de Pesquisas",
    "Mudança em três meses",
    `Mudança em relação ao mesmo mês do ano anterior\n(${yoyShort(year - 1)} e ${yoyShort(year)})`,
    "Concorrência",
    "Grau de concorrência",
    "Menores valores para aparecer no topo da pesquisa",
    "Maiores valores para aparecer no topo da pesquisa",
    ...mCols.map((c) => c.replace("Searches: ", "Searches:\n")),
  ];

  const seedsLabel = `Palavras-chaves usadas (limite 10):  ${seeds.join("; ")}`;

  const aoa: unknown[][] = [
    [`${mName} de ${year}`, locLabel, "", seedsLabel],
    headers,
    ...items.map((item) => dataRow(item, mCols)),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [50, 15, 14, 22, 14, 13, 16, 15, ...Array(12).fill(13)].map((w) => ({ wch: w }));
  return ws;
}

function buildNegativasSheet(): XLSX.WorkSheet {
  const aoa: unknown[][] = [
    ["Categoria", "Palavras Negativas"],
    ...FIXED_NEGATIVAS,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 42 }, { wch: 110 }];
  return ws;
}

export type StudyDoc = {
  created_at?: string;
  country?: string;
  default_locations?: string[];
  locations?: string[];
  seed_keywords?: string[];
  tabs?: Array<{ name?: string; seeds?: string[]; items?: Item[]; locations?: string[] }>;
  general?: Item[];
  categories?: Record<string, Item[]>;
};

export function generateXlsx(study: StudyDoc): Uint8Array {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const [mName, year] = monthYear(study.created_at);

  if (Array.isArray(study.tabs)) {
    const defLocs = study.default_locations ?? [];
    const defLabel = locationLabel(defLocs, study.country ?? "BR");

    for (const tab of study.tabs) {
      const locs = tab.locations?.length ? tab.locations : defLocs;
      const label = locs.length ? locationLabel(locs, study.country ?? "BR") : defLabel;
      const ws = buildDataSheet((tab.items ?? []) as Item[], tab.seeds ?? [], label, mName, year);
      XLSX.utils.book_append_sheet(wb, ws, safeTitle(tab.name ?? "Aba", used));
    }

    if (used.size === 0) {
      XLSX.utils.book_append_sheet(wb, buildDataSheet([], [], defLabel, mName, year), safeTitle("Geral", used));
    }
  } else {
    const seeds = study.seed_keywords ?? [];
    const label = locationLabel(study.locations ?? [], study.country ?? "BR");

    XLSX.utils.book_append_sheet(wb, buildDataSheet((study.general ?? []) as Item[], seeds, label, mName, year), safeTitle("Geral", used));

    for (const [cat, items] of Object.entries(study.categories ?? {})) {
      XLSX.utils.book_append_sheet(wb, buildDataSheet(items as Item[], seeds, label, mName, year), safeTitle(cat, used));
    }
  }

  XLSX.utils.book_append_sheet(wb, buildNegativasSheet(), safeTitle("Palavras Negativas", used));

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}
