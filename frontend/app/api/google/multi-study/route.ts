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

    const tabResults: Array<{ name: string; seeds: string[]; items: unknown[]; error?: string }> = [];

    for (let index = 0; index < tabs.length; index++) {
      if (index > 0) await delay(5000);

      const tab = tabs[index];
      const name = (tab.name ?? `Aba ${index + 1}`).trim();
      const seeds = (tab.seeds ?? []).map((s) => s.trim()).filter(Boolean);
      if (!seeds.length) {
        tabResults.push({ name, seeds: [], items: [], error: "Sem seeds válidas." });
        continue;
      }
      const locations = tab.locations?.length ? tab.locations : defLocations;
      const country = (tab.country ?? defCountry).toUpperCase();
      const limit = Math.max(1, Number(tab.limit ?? defLimit));

      let pushed = false;
      for (let attempt = 0; attempt <= 3; attempt++) {
        if (attempt > 0) await delay(7000);
        try {
          const items = await googleKeywordSearch({ readEnv, keywords: seeds, country, limit, locations });
          tabResults.push({ name, seeds, items });
          pushed = true;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erro desconhecido.";
          const isRateLimit = msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429");
          if (isRateLimit && attempt < 3) continue;
          tabResults.push({ name, seeds, items: [], error: msg });
          pushed = true;
          break;
        }
      }
      if (!pushed) tabResults.push({ name, seeds, items: [], error: "Max retries atingido." });
    }

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
