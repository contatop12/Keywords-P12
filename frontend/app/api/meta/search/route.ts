import { getCloudflareContext } from "@opennextjs/cloudflare";

const META_API_VERSION = "v25.0";
const META_LOCALE = "pt_BR";

type Payload = {
  keyword?: string;
  country?: string;
  limit?: number;
};

type RawInterest = {
  id?: string;
  name?: string;
  audience_size?: number;
  audience_size_lower_bound?: number;
  audience_size_upper_bound?: number;
  type?: string;
  path?: string[];
};

function extractAudienceSize(item: RawInterest): number | null {
  if (typeof item.audience_size === "number") return item.audience_size;
  const lower = item.audience_size_lower_bound;
  const upper = item.audience_size_upper_bound;
  if (typeof lower === "number" && typeof upper === "number") {
    return Math.round((lower + upper) / 2);
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const ctx = await getCloudflareContext();
    const env = ctx.env as unknown as Record<string, string | undefined>;
    const readEnv = (key: string) => env[key] ?? process.env[key];

    const accessToken = readEnv("META_ACCESS_TOKEN") ?? readEnv("ACCESS_TOKEN") ?? "";
    const adAccountId = (
      readEnv("META_AD_ACCOUNT_ID") ??
      readEnv("AD_ACCOUNT_ID") ??
      readEnv("META_ACCOUNT_ID") ??
      ""
    ).replace("act_", "").trim();

    if (!accessToken) {
      return Response.json(
        { detail: "Token Meta nao configurado. Defina META_ACCESS_TOKEN no Cloudflare." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Payload;
    const keyword = (body.keyword ?? "").trim();
    if (!keyword) {
      return Response.json({ results: [] });
    }
    const country = (body.country ?? "BR").trim().toUpperCase();
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 50)));

    const params = new URLSearchParams({
      type: "adinterest",
      q: keyword,
      limit: String(limit),
      locale: META_LOCALE,
      country_code: country,
      access_token: accessToken,
    });

    let response: Response | null = null;

    if (adAccountId) {
      const targetingUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${adAccountId}/targetingsearch?${params}`;
      try {
        const r = await fetch(targetingUrl);
        if (r.ok) response = r;
      } catch {
        // fall through to /search
      }
    }

    if (!response) {
      const searchUrl = `https://graph.facebook.com/${META_API_VERSION}/search?${params}`;
      response = await fetch(searchUrl);
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const detail =
        (errBody as { error?: { message?: string } })?.error?.message ??
        "Meta API retornou erro. Verifique token/permissoes.";
      return Response.json({ detail }, { status: 502 });
    }

    const data = (await response.json()) as { data?: RawInterest[] };
    const raw = data.data ?? [];

    const results = raw.map((item) => ({
      id: String(item.id ?? ""),
      name: item.name ?? "",
      audience_size: extractAudienceSize(item),
      type: item.type ?? null,
      path: item.path ?? [],
    }));

    return Response.json({ results });
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : "Falha inesperada na busca Meta." },
      { status: 500 }
    );
  }
}
