import { getCloudflareContext } from "@opennextjs/cloudflare";
import { googleKeywordSearch } from "../../../../lib/server/googleAds";

type TabSpec = {
  name?: string;
  seeds?: string[];
  locations?: string[] | null;
  country?: string | null;
  limit?: number | null;
};

type Payload = {
  tabs?: TabSpec[];
  locations?: string[];
  country?: string;
  limit?: number;
};

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as Payload;
    const tabs = payload.tabs ?? [];

    if (!tabs.length) {
      return Response.json({ detail: "Informe ao menos uma aba." }, { status: 422 });
    }
    if (tabs.length > 50) {
      return Response.json({ detail: "Máximo de 50 abas por estudo." }, { status: 422 });
    }

    const ctx = await getCloudflareContext();
    const env = ctx.env as unknown as Record<string, string | undefined>;
    const readEnv = (key: string) => env[key] ?? process.env[key];

    const defLocations = payload.locations ?? [];
    const defCountry = (payload.country ?? "BR").toUpperCase();
    const defLimit = Math.max(1, Number(payload.limit ?? 50));

    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    const tabResults = await Promise.all(
      tabs.map(async (tab, index) => {
        const name = (tab.name ?? `Aba ${index + 1}`).trim();
        const seeds = (tab.seeds ?? []).map((s) => s.trim()).filter(Boolean);
        if (!seeds.length) {
          return { name, seeds: [], items: [], error: "Sem seeds válidas." };
        }
        const locations = tab.locations?.length ? tab.locations : defLocations;
        const country = (tab.country ?? defCountry).toUpperCase();
        const limit = Math.max(1, Number(tab.limit ?? defLimit));

        if (index > 0) await delay(index * 2000);

        for (let attempt = 0; attempt <= 2; attempt++) {
          try {
            const items = await googleKeywordSearch({ readEnv, keywords: seeds, country, limit, locations });
            return { name, seeds, items };
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Erro desconhecido.";
            const isRateLimit = msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429");
            if (isRateLimit && attempt < 2) {
              await delay(7000);
              continue;
            }
            return { name, seeds, items: [], error: msg };
          }
        }
        return { name, seeds, items: [], error: "Max retries atingido." };
      })
    );

    return Response.json({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      country: defCountry,
      default_locations: defLocations,
      tabs: tabResults,
    });
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : "Erro ao gerar estudo multi-aba." },
      { status: 500 }
    );
  }
}
