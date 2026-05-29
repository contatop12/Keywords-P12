import { getKV, readIndex, writeIndex } from "../../../../lib/server/kv";
import type { Structure, StructureIndexEntry } from "../../../../lib/types";

const INDEX_KEY = "structures-index";

function indexEntry(s: Structure): StructureIndexEntry {
  return {
    id: s.id,
    client_name: s.client_name,
    objetivo: s.objetivo,
    status: s.status,
    created_at: s.created_at,
    grupos_count: s.grupos.length,
    keywords_count: s.grupos.reduce((acc, g) => acc + g.keywords.length, 0),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kv = await getKV();
    const raw = await kv.get(`structure:${id}`);
    if (!raw) return Response.json({ error: "Estrutura não encontrada." }, { status: 404 });
    return Response.json(JSON.parse(raw));
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kv = await getKV();
    const raw = await kv.get(`structure:${id}`);
    if (!raw) return Response.json({ error: "Estrutura não encontrada." }, { status: 404 });

    const existing = JSON.parse(raw) as Structure;
    const patch = (await req.json()) as Partial<Structure>;
    const updated: Structure = {
      ...existing,
      ...patch,
      id,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };

    await kv.put(`structure:${id}`, JSON.stringify(updated));

    const index = await readIndex<StructureIndexEntry>(kv, INDEX_KEY);
    await writeIndex(kv, INDEX_KEY, [indexEntry(updated), ...index.filter((e) => e.id !== id)]);

    return Response.json({ ok: true, id });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kv = await getKV();
    await kv.delete(`structure:${id}`);
    const index = await readIndex<StructureIndexEntry>(kv, INDEX_KEY);
    await writeIndex(kv, INDEX_KEY, index.filter((e) => e.id !== id));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
