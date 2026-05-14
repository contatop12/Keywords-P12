import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";

export async function GET() {
  try {
    const ctx = await getCloudflareContext();
    const env = ctx.env as CloudflareEnv;
    const { results } = await env.DB.prepare(
      "SELECT id, created_at, seed_keywords, locations, country, name FROM studies ORDER BY created_at DESC"
    ).all();
    return Response.json(results);
  } catch {
    return Response.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getCloudflareContext();
    const env = ctx.env as CloudflareEnv;
    const body = (await req.json()) as Record<string, unknown>;
    const name = (body.name as string | null) ?? null;

    await env.DB.prepare(
      "INSERT OR REPLACE INTO studies (id, created_at, seed_keywords, locations, country, study_data, name) VALUES (?,?,?,?,?,?,?)"
    )
      .bind(
        body.id as string,
        body.created_at as string,
        JSON.stringify(body.seed_keywords),
        JSON.stringify(body.locations),
        body.country as string,
        JSON.stringify(body),
        name
      )
      .run();

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
