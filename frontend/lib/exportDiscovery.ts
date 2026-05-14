import * as XLSX from "xlsx";

import { buildGoogleTableColumns, GOOGLE_MONTH_COLUMNS } from "./googleColumns";
import { DiscoveryResult, InterestItem } from "./types";

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowValues(item: InterestItem): unknown[] {
  const monthly = item.searches_mensais ?? {};
  return [
    item.name,
    item.media_pesquisas ?? "",
    item.mudanca_tres_meses ?? "",
    item.mudanca_ano_anterior ?? "",
    item.concorrencia ?? "",
    item.grau_concorrencia ?? "",
    item.menor_lance_topo ?? "",
    item.maior_lance_topo ?? "",
    ...GOOGLE_MONTH_COLUMNS.map((label) => monthly[label] ?? ""),
  ];
}

export function downloadDiscoveryCsv(items: InterestItem[], filename: string): void {
  const headers = buildGoogleTableColumns().map((column) => column.label);
  const lines = [headers.map(escapeCsv).join(",")];
  for (const item of items) {
    lines.push(rowValues(item).map(escapeCsv).join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function discoveryExportFilename(discovery: DiscoveryResult, extension: string): string {
  const stamp = discovery.created_at.slice(0, 10).replace(/-/g, "");
  return `keywords-${stamp || "export"}.${extension}`;
}

function sheetRows(items: InterestItem[]): Array<Array<string | number>> {
  const headers = buildGoogleTableColumns().map((column) => column.label);
  const rows: Array<Array<string | number>> = [headers];
  for (const item of items) {
    const monthly = item.searches_mensais ?? {};
    rows.push([
      item.name,
      item.media_pesquisas ?? "",
      item.mudanca_tres_meses ?? "",
      item.mudanca_ano_anterior ?? "",
      item.concorrencia ?? "",
      item.grau_concorrencia ?? "",
      item.menor_lance_topo ?? "",
      item.maior_lance_topo ?? "",
      ...GOOGLE_MONTH_COLUMNS.map((label) => monthly[label] ?? ""),
    ]);
  }
  return rows;
}

export function downloadDiscoveryXlsx(discovery: DiscoveryResult): void {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(sheetRows(discovery.general)),
    "Geral"
  );
  for (const [category, items] of Object.entries(discovery.categories)) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(sheetRows(items)),
      category.slice(0, 31)
    );
  }
  XLSX.writeFile(workbook, discoveryExportFilename(discovery, "xlsx"));
}
