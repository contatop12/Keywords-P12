import { getCloudflareContext } from "@opennextjs/cloudflare";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type StudyIndexEntry = {
  id: string;
  created_at: string;
  client_name: string;
  brief_preview: string;
  tab_count: number;
  keyword_count: number;
};

type SavePayload = {
  study: Record<string, unknown>;
  client_name: string;
  brief_preview: string;
  brief?: Record<string, unknown>;
};

async function getKV(): Promise<KVNamespace> {
  const ctx = await getCloudflareContext();
  const kv = (ctx.env as Record<string, unknown>).STUDIES_KV as KVNamespace | undefined;
  if (!kv) throw new Error("STUDIES_KV não configurado.");
  return kv;
}

async function getIndex(kv: KVNamespace): Promise<StudyIndexEntry[]> {
  const raw = await kv.get("index");
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StudyIndexEntry[];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const kv = await getKV();
    const index = await getIndex(kv);
    return Response.json(index);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const kv = await getKV();
    const body = (await req.json()) as SavePayload;
    const study = body.study;
    const id = (study.id as string) ?? crypto.randomUUID();
    const created_at = (study.created_at as string) ?? new Date().toISOString();
    const tabs = (study.tabs as Array<{ items?: unknown[] }>) ?? [];
    const keyword_count = tabs.reduce((acc, t) => acc + (t.items?.length ?? 0), 0);

    const stored = {
      ...study,
      client_name: body.client_name ?? "",
      brief_preview: body.brief_preview ?? "",
      brief: body.brief ?? {},
    };
    await kv.put(`study:${id}`, JSON.stringify(stored));

    const entry: StudyIndexEntry = {
      id,
      created_at,
      client_name: body.client_name || "Cliente",
      brief_preview: body.brief_preview || "",
      tab_count: tabs.length,
      keyword_count,
    };
    const index = await getIndex(kv);
    const newIndex = [entry, ...index.filter((e) => e.id !== id)];
    await kv.put("index", JSON.stringify(newIndex));

    return Response.json({ ok: true, id });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
