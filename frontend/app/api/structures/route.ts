import { getKV, readIndex, writeIndex } from "../../../lib/server/kv";
import type { Structure, StructureIndexEntry } from "../../../lib/types";

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

export async function GET() {
  try {
    const kv = await getKV();
    const index = await readIndex<StructureIndexEntry>(kv, INDEX_KEY);
    return Response.json(index);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const kv = await getKV();
    const body = (await req.json()) as Structure;
    const now = new Date().toISOString();
    const id = body.id || crypto.randomUUID();
    const structure: Structure = {
      ...body,
      id,
      created_at: body.created_at || now,
      updated_at: now,
    };

    await kv.put(`structure:${id}`, JSON.stringify(structure));

    const index = await readIndex<StructureIndexEntry>(kv, INDEX_KEY);
    await writeIndex(kv, INDEX_KEY, [indexEntry(structure), ...index.filter((e) => e.id !== id)]);

    return Response.json({ ok: true, id });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
