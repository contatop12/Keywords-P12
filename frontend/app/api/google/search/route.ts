import { getCloudflareContext } from "@opennextjs/cloudflare";

import { googleKeywordSearch } from "../../../../lib/server/googleAds";

type Payload = {
  keyword?: string;
  keywords?: string[];
  country?: string;
  limit?: number;
  locations?: string[];
};

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as Payload;
    const keyword = (payload.keyword ?? "").trim();
    const keywords = (payload.keywords ?? []).map((k) => k.trim()).filter(Boolean);
    const effective = keywords.length > 0 ? keywords : keyword ? [keyword] : [];
    if (effective.length === 0) {
      return Response.json({ results: [] });
    }
    const country = (payload.country ?? "BR").trim().toUpperCase();
    const limit = Math.max(1, Math.min(100, Number(payload.limit ?? 50)));
    const locations = Array.isArray(payload.locations) ? payload.locations : [];

    const ctx = await getCloudflareContext();
    const env = ctx.env as unknown as Record<string, string | undefined>;
    const results = await googleKeywordSearch({
      readEnv: (key) => env[key] ?? process.env[key],
      keywords: effective,
      country,
      limit,
      locations,
    });
    return Response.json({ results });
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : "Falha na busca Google Ads." },
      { status: 500 }
    );
  }
}
