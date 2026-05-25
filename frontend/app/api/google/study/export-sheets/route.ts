import { getCloudflareContext } from "@opennextjs/cloudflare";

const PT_MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const INVALID_CHARS = /[\\/*?:[\]]/g;

type Item = Record<string, unknown>;
type Tab = { name?: string; seeds?: string[]; items?: Item[] };
type Study = {
  created_at?: string;
  country?: string;
  default_locations?: string[];
  tabs?: Tab[];
};

function safeTitle(name: string): string {
  return (name.replace(INVALID_CHARS, " ").trim() || "Aba").slice(0, 31);
}

function monthYear(createdAt: string | undefined): [string, number] {
  const d = createdAt ? new Date(createdAt) : new Date();
  const v = isNaN(d.getTime()) ? new Date() : d;
  return [PT_MONTHS[v.getMonth()], v.getFullYear()];
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

function formatLocation(locations: string[], country: string): string {
  const first = (locations[0] ?? "").trim().replace(/^(city|state|country):/i, "").split("#")[0].trim();
  if (first) return `${first.charAt(0).toUpperCase()}${first.slice(1)}`;
  return country?.toUpperCase() || "—";
}

function buildRows(items: Item[], seeds: string[], mCols: string[], mName: string, year: number, locLabel: string): unknown[][] {
  const seedsLabel = seeds.join("; ");
  const rows: unknown[][] = [
    [`${mName} de ${year}`, locLabel, "", `Seeds: ${seedsLabel}`],
    [
      "Palavra-Chave", "Média de Pesquisas", "Mudança em três meses",
      "Mudança YoY", "Concorrência", "Grau de concorrência",
      "Menor Lance Topo", "Maior Lance Topo", ...mCols,
    ],
  ];
  for (const item of items) {
    const monthly = (item.searches_mensais as Record<string, number> | undefined) ?? {};
    rows.push([
      item.name ?? "",
      item.media_pesquisas ?? null,
      item.mudanca_tres_meses ?? "--",
      item.mudanca_ano_anterior ?? "--",
      item.concorrencia ?? "Desconhecido",
      item.grau_concorrencia ?? null,
      item.menor_lance_topo ?? null,
      item.maior_lance_topo ?? null,
      ...mCols.map((c) => monthly[c] ?? null),
    ]);
  }
  return rows;
}

async function getToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`OAuth falhou: ${await res.text()}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Resposta OAuth sem access_token.");
  return data.access_token;
}

async function makeFilePublic(token: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "anyone", role: "reader" }),
  });
  if (!res.ok) throw new Error(`Drive permissions falhou: ${await res.text()}`);
}

async function copyTemplate(token: string, templateId: string, title: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${templateId}/copy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: title }),
  });
  if (!res.ok) throw new Error(`Drive copy falhou: ${await res.text()}`);
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("Drive copy não retornou ID.");
  return data.id;
}

async function getSheetIds(token: string, spreadsheetId: string): Promise<Map<string, number>> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Sheets get falhou: ${await res.text()}`);
  const data = (await res.json()) as { sheets?: Array<{ properties?: { title?: string; sheetId?: number } }> };
  const map = new Map<string, number>();
  for (const s of data.sheets ?? []) {
    const t = s.properties?.title ?? "";
    const id = s.properties?.sheetId ?? 0;
    map.set(t, id);
  }
  return map;
}

async function renameSheet(token: string, spreadsheetId: string, sheetId: number, newTitle: string): Promise<void> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ updateSheetProperties: { properties: { sheetId, title: newTitle }, fields: "title" } }],
    }),
  });
  if (!res.ok) throw new Error(`Rename sheet falhou: ${await res.text()}`);
}

async function duplicateSheet(
  token: string,
  spreadsheetId: string,
  sourceSheetId: number,
  newTitle: string,
  insertSheetIndex: number,
): Promise<number> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ duplicateSheet: { sourceSheetId, insertSheetIndex, newSheetName: newTitle } }],
    }),
  });
  if (!res.ok) throw new Error(`Duplicate sheet falhou: ${await res.text()}`);
  const data = (await res.json()) as {
    replies?: Array<{ duplicateSheet?: { properties?: { sheetId?: number } } }>;
  };
  return data.replies?.[0]?.duplicateSheet?.properties?.sheetId ?? 0;
}

async function writeSheet(token: string, spreadsheetId: string, sheetTitle: string, rows: unknown[][]): Promise<void> {
  if (!rows.length) return;
  const encoded = encodeURIComponent(`${sheetTitle}!A1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encoded}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ range: `${sheetTitle}!A1`, values: rows }),
    }
  );
  if (!res.ok) throw new Error(`Write sheet falhou: ${await res.text()}`);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { study?: Study };
    const study = body.study ?? (body as unknown as Study);

    const ctx = await getCloudflareContext();
    const env = ctx.env as unknown as Record<string, string | undefined>;
    const readEnv = (key: string) => env[key] ?? process.env[key];

    const clientId = (readEnv("GOOGLE_ADS_CLIENT_ID") ?? readEnv("GOOGLE_CLIENT_ID") ?? "").trim();
    const clientSecret = (readEnv("GOOGLE_ADS_CLIENT_SECRET") ?? readEnv("GOOGLE_CLIENT_SECRET") ?? "").trim();
    const refreshToken = (readEnv("GOOGLE_ADS_REFRESH_TOKEN") ?? readEnv("GOOGLE_REFRESH_TOKEN") ?? "").trim();
    const templateId = (readEnv("GOOGLE_SHEETS_TEMPLATE_ID") ?? "1pGKcVyFiWWvslaPMsmcwkTWI4AS4LdRGi4vVSRS-vAY").trim();

    if (!clientId || !clientSecret || !refreshToken) {
      return Response.json({ detail: "Credenciais Google ausentes. Configure GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET e GOOGLE_ADS_REFRESH_TOKEN." }, { status: 500 });
    }

    const [mName, year] = monthYear(study.created_at);
    const defLocs = study.default_locations ?? [];
    const locLabel = formatLocation(defLocs, study.country ?? "BR");
    const title = `Estudo Keywords — ${mName} ${year} · ${locLabel}`;
    const mCols = monthColumns(mName, year);

    const token = await getToken(clientId, clientSecret, refreshToken);
    const spreadsheetId = await copyTemplate(token, templateId, title);
    const existingIds = await getSheetIds(token, spreadsheetId);

    // Template's first sheet — source for all duplicates (preserves formatting)
    const firstEntry = existingIds.entries().next().value as [string, number] | undefined;
    if (!firstEntry) throw new Error("Template sem abas.");
    const [, templateSheetId] = firstEntry;

    const tabs = study.tabs ?? [];
    const usedTitles = new Set<string>();
    const tabNames: string[] = [];

    // Phase 1: create all sheets by duplicating the template Geral tab
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      let sheetName = safeTitle(tab.name ?? "Aba");
      if (usedTitles.has(sheetName)) {
        let n = 2;
        while (usedTitles.has(`${sheetName.slice(0, 28)} (${n})`)) n++;
        sheetName = `${sheetName.slice(0, 28)} (${n})`;
      }
      usedTitles.add(sheetName);
      tabNames.push(sheetName);

      if (i === 0) {
        await renameSheet(token, spreadsheetId, templateSheetId, sheetName);
      } else {
        // Duplicate BEFORE writing data so all copies get the clean template formatting
        await duplicateSheet(token, spreadsheetId, templateSheetId, sheetName, i);
      }
    }

    // Phase 2: write data into each sheet
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const rows = buildRows(
        (tab.items ?? []) as Item[],
        tab.seeds ?? [],
        mCols,
        mName,
        year,
        locLabel,
      );
      await writeSheet(token, spreadsheetId, tabNames[i], rows);
    }

    await makeFilePublic(token, spreadsheetId);

    return Response.json({ url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` });
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : "Erro ao exportar para Google Sheets." },
      { status: 500 }
    );
  }
}
