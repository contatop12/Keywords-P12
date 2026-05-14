import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getCloudflareContext();
    const env = ctx.env as CloudflareEnv;
    const row = await env.DB.prepare("SELECT study_data FROM studies WHERE id = ?")
      .bind(id)
      .first<{ study_data: string }>();
    if (!row) return Response.json({ error: "Estudo nao encontrado." }, { status: 404 });
    return Response.json(JSON.parse(row.study_data));
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
    const ctx = await getCloudflareContext();
    const env = ctx.env as CloudflareEnv;
    await env.DB.prepare("DELETE FROM studies WHERE id = ?").bind(id).run();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
