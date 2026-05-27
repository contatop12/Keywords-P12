const BACKEND_URL = process.env.BACKEND_URL ?? "https://keywords-p12-api.fly.dev";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const upstream = await fetch(`${BACKEND_URL}/api/meta/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json();
    return Response.json(data, { status: upstream.status });
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : "Falha inesperada na busca Meta." },
      { status: 500 }
    );
  }
}
