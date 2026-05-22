import { getCloudflareContext } from "@opennextjs/cloudflare";

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

async function getKV(): Promise<KVNamespace> {
  const ctx = await getCloudflareContext();
  const kv = (ctx.env as Record<string, unknown>).STUDIES_KV as KVNamespace | undefined;
  if (!kv) throw new Error("STUDIES_KV não configurado.");
  return kv;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const kv = await getKV();
    const raw = await kv.get(`study:${id}`);
    if (!raw) return Response.json({ error: "Estudo não encontrado." }, { status: 404 });
    return Response.json(JSON.parse(raw));
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const kv = await getKV();
    await kv.delete(`study:${id}`);
    const raw = await kv.get("index");
    if (raw) {
      const index = JSON.parse(raw) as Array<{ id: string }>;
      await kv.put("index", JSON.stringify(index.filter((e) => e.id !== id)));
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
