import { getCloudflareContext } from "@opennextjs/cloudflare";

import { googleGeoSuggestions } from "../../../../../lib/server/googleAds";

type Payload = {
  query?: string;
  country?: string;
  geo_type?: "city" | "state" | "country";
  limit?: number;
};

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as Payload;
    const query = (payload.query ?? "").trim();
    if (!query) {
      return Response.json({ detail: "query obrigatorio." }, { status: 422 });
    }
    const country = (payload.country ?? "BR").trim().toUpperCase();
    const geoType = payload.geo_type ?? "city";
    const limit = Math.max(1, Math.min(25, Number(payload.limit ?? 25)));

    const ctx = await getCloudflareContext();
    const env = ctx.env as unknown as Record<string, string | undefined>;
    const results = await googleGeoSuggestions({
      readEnv: (key) => env[key] ?? process.env[key],
      query,
      country,
      geoType,
      limit,
    });
    return Response.json({ results });
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : "Falha ao buscar localizacoes." },
      { status: 500 }
    );
  }
}
