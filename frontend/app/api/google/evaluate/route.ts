import { getCloudflareContext } from "@opennextjs/cloudflare";
import { evaluateItems, evaluateTabs, readKnobs, TIER_LABELS } from "../../../../lib/server/keywordEvaluator";

type Item = Record<string, unknown>;

type Payload = {
  tabs?: Array<{ name?: string; seeds?: string[]; items?: Item[] }>;
  items?: Item[];
  seeds?: string[];
  niche?: string;
};

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as Payload;

    const ctx = await getCloudflareContext();
    const env = ctx.env as unknown as Record<string, string | undefined>;
    const readEnv = (key: string) => env[key] ?? process.env[key];

    if (!readKnobs(readEnv).enabled) {
      return Response.json({ detail: "Avaliador desabilitado (EVALUATOR_ENABLED=false)." }, { status: 422 });
    }

    const seeds = (payload.seeds ?? []).map((s) => String(s).trim()).filter(Boolean);
    const niche = (payload.niche ?? "").trim();

    if (Array.isArray(payload.tabs)) {
      const { tabs, resumo } = await evaluateTabs(readEnv, payload.tabs, seeds, niche);
      return Response.json({ tabs, resumo, labels: TIER_LABELS });
    }

    if (Array.isArray(payload.items)) {
      const { items, resumo } = await evaluateItems(readEnv, payload.items, seeds, niche);
      return Response.json({ items, resumo, labels: TIER_LABELS });
    }

    return Response.json({ detail: "Informe `tabs` ou `items`." }, { status: 422 });
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : "Erro ao avaliar palavras-chave." },
      { status: 500 }
    );
  }
}
