import * as XLSX from "xlsx-js-style";

type Tier = "oportunidade_excelente" | "otimo" | "talvez" | "negativar";

const TIER_LABELS: Record<Tier, string> = {
  oportunidade_excelente: "Oportunidade Excelente",
  otimo: "Ótimo",
  talvez: "Talvez",
  negativar: "Negativar",
};

const TIER_ORDER: Tier[] = ["oportunidade_excelente", "otimo", "talvez", "negativar"];

// Preenchimento sólido (ARGB) por tier — tons claros p/ leitura com texto preto.
const TIER_FILL: Record<Tier, string> = {
  oportunidade_excelente: "FFD6E4FF",
  otimo: "FFD6F5E3",
  talvez: "FFFBF0C4",
  negativar: "FFFAD4D4",
};

type Classificacao = { tier: Tier; rotulo: string; motivo: string };
type Item = Record<string, unknown> & { classificacao?: Classificacao };

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

function tierOf(item: Item): Tier | null {
  const t = item.classificacao?.tier;
  return t && t in TIER_LABELS ? (t as Tier) : null;
}

const HEADERS = [
  "Palavra-Chave",
  "Classificação",
  "Motivo",
  "Média de Pesquisas",
  "Mudança 3M",
  "Mudança Ano",
  "Concorrência",
  "Grau",
  "Lance Mín",
  "Lance Máx",
];

const HEADER_STYLE = {
  font: { bold: true },
  fill: { patternType: "solid", fgColor: { rgb: "FFEDEDED" } },
};

function styledRow(values: unknown[], fillRgb?: string): XLSX.CellObject[] {
  return values.map((v) => {
    const cell: XLSX.CellObject = {
      t: typeof v === "number" ? "n" : "s",
      v: (v ?? "") as string | number,
    };
    if (fillRgb) {
      cell.s = { fill: { patternType: "solid", fgColor: { rgb: fillRgb } } };
    }
    return cell;
  });
}

function buildDataSheet(items: Item[]): XLSX.WorkSheet {
  const rows: XLSX.CellObject[][] = [
    HEADERS.map((h) => ({ t: "s", v: h, s: HEADER_STYLE } as XLSX.CellObject)),
  ];

  // Ordena por tier (melhor → pior) para leitura.
  const sorted = [...items].sort((a, b) => {
    const ta = tierOf(a);
    const tb = tierOf(b);
    const ia = ta ? TIER_ORDER.indexOf(ta) : 99;
    const ib = tb ? TIER_ORDER.indexOf(tb) : 99;
    return ia - ib;
  });

  for (const item of sorted) {
    const tier = tierOf(item);
    const fill = tier ? TIER_FILL[tier] : undefined;
    rows.push(
      styledRow(
        [
          item.name ?? "",
          tier ? TIER_LABELS[tier] : "",
          item.classificacao?.motivo ?? "",
          item.media_pesquisas ?? "",
          item.mudanca_tres_meses ?? "--",
          item.mudanca_ano_anterior ?? "--",
          item.concorrencia ?? "Desconhecido",
          item.grau_concorrencia ?? "",
          item.menor_lance_topo ?? "",
          item.maior_lance_topo ?? "",
        ],
        fill
      )
    );
  }

  const ws = XLSX.utils.aoa_to_sheet([[]]);
  XLSX.utils.sheet_add_aoa(ws, [], { origin: "A1" });
  // Escreve células com estilo manualmente.
  const range = { s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: HEADERS.length - 1 } };
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      ws[XLSX.utils.encode_cell({ r, c })] = rows[r][c];
    }
  }
  ws["!ref"] = XLSX.utils.encode_range(range);
  ws["!cols"] = [50, 20, 60, 16, 12, 12, 14, 8, 12, 12].map((w) => ({ wch: w }));
  return ws;
}

function buildNegativarSheet(tabs: Array<{ name: string; items: Item[] }>): XLSX.WorkSheet {
  const rows: XLSX.CellObject[][] = [
    ["Palavra-Chave (colar no Google Ads)", "Aba", "Motivo"].map(
      (h) => ({ t: "s", v: h, s: HEADER_STYLE } as XLSX.CellObject)
    ),
  ];
  for (const tab of tabs) {
    for (const item of tab.items) {
      if (tierOf(item) !== "negativar") continue;
      rows.push(
        styledRow(
          [item.name ?? "", tab.name, item.classificacao?.motivo ?? ""],
          TIER_FILL.negativar
        )
      );
    }
  }
  const ws = XLSX.utils.aoa_to_sheet([[]]);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      ws[XLSX.utils.encode_cell({ r, c })] = rows[r][c];
    }
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 0), c: 2 } });
  ws["!cols"] = [{ wch: 50 }, { wch: 24 }, { wch: 60 }];
  return ws;
}

function buildResumoSheet(tabs: Array<{ name: string; items: Item[] }>): XLSX.WorkSheet {
  const aoa: unknown[][] = [["Aba", ...TIER_ORDER.map((t) => TIER_LABELS[t]), "Total"]];
  const totals: Record<Tier, number> = {
    oportunidade_excelente: 0,
    otimo: 0,
    talvez: 0,
    negativar: 0,
  };
  for (const tab of tabs) {
    const counts: Record<Tier, number> = {
      oportunidade_excelente: 0,
      otimo: 0,
      talvez: 0,
      negativar: 0,
    };
    for (const item of tab.items) {
      const t = tierOf(item);
      if (t) {
        counts[t] += 1;
        totals[t] += 1;
      }
    }
    aoa.push([tab.name, ...TIER_ORDER.map((t) => counts[t]), tab.items.length]);
  }
  const grandTotal = TIER_ORDER.reduce((acc, t) => acc + totals[t], 0);
  aoa.push(["TOTAL", ...TIER_ORDER.map((t) => totals[t]), grandTotal]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 28 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }];
  return ws;
}

export type ClassifiedStudyDoc = {
  tabs?: Array<{ name?: string; items?: Item[] }>;
  items?: Item[];
};

export function generateClassifiedXlsx(study: ClassifiedStudyDoc): Uint8Array {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  const tabs: Array<{ name: string; items: Item[] }> = Array.isArray(study.tabs)
    ? study.tabs.map((t, i) => ({ name: t.name ?? `Aba ${i + 1}`, items: (t.items ?? []) as Item[] }))
    : [{ name: "Geral", items: (study.items ?? []) as Item[] }];

  XLSX.utils.book_append_sheet(wb, buildResumoSheet(tabs), safeTitle("Resumo", used));
  for (const tab of tabs) {
    XLSX.utils.book_append_sheet(wb, buildDataSheet(tab.items), safeTitle(tab.name, used));
  }
  XLSX.utils.book_append_sheet(wb, buildNegativarSheet(tabs), safeTitle("Negativar", used));

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}
