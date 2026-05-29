import { getKV, readIndex, writeIndex } from "../../../../lib/server/kv";
import type { ClientProfile, ClientProfileIndexEntry } from "../../../../lib/types";

const INDEX_KEY = "clients-index";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kv = await getKV();
    const raw = await kv.get(`client:${id}`);
    if (!raw) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });
    return Response.json(JSON.parse(raw));
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kv = await getKV();
    const raw = await kv.get(`client:${id}`);
    if (!raw) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });

    const existing = JSON.parse(raw) as ClientProfile;
    const patch = (await req.json()) as Partial<ClientProfile>;
    const now = new Date().toISOString();

    const updated: ClientProfile = {
      ...existing,
      ...patch,
      id,
      created_at: existing.created_at,
      updated_at: now,
    };

    if (!updated.nome_empresa.trim()) {
      return Response.json({ error: "nome_empresa é obrigatório." }, { status: 422 });
    }

    await kv.put(`client:${id}`, JSON.stringify(updated));

    const index = await readIndex<ClientProfileIndexEntry>(kv, INDEX_KEY);
    const entry: ClientProfileIndexEntry = {
      id,
      nome_empresa: updated.nome_empresa,
      created_at: updated.created_at,
      updated_at: now,
    };
    await writeIndex(kv, INDEX_KEY, [entry, ...index.filter((e) => e.id !== id)]);

    return Response.json({ ok: true, id });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kv = await getKV();
    await kv.delete(`client:${id}`);
    const index = await readIndex<ClientProfileIndexEntry>(kv, INDEX_KEY);
    await writeIndex(kv, INDEX_KEY, index.filter((e) => e.id !== id));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
