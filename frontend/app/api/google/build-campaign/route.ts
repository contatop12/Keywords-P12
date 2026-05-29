import { getCloudflareContext } from "@opennextjs/cloudflare";
import { buildStructure } from "../../../../lib/server/campaignBuilder";
import { getKV } from "../../../../lib/server/kv";
import type { ClientProfile } from "../../../../lib/types";

type Item = Record<string, unknown>;

type Payload = {
  tabs?: Array<{ name?: string; items?: Item[] }>;
  clientProfile?: ClientProfile;
  clientProfileId?: string;
  objetivo?: "search";
};

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as Payload;

    const tabs = payload.tabs ?? [];
    if (!tabs.length) {
      return Response.json({ detail: "Informe as abas do estudo avaliado." }, { status: 422 });
    }

    let profile: ClientProfile | null = payload.clientProfile ?? null;
    if (!profile && payload.clientProfileId) {
      const kv = await getKV();
      const raw = await kv.get(`client:${payload.clientProfileId}`);
      if (!raw) return Response.json({ detail: "Perfil de cliente não encontrado." }, { status: 404 });
      profile = JSON.parse(raw) as ClientProfile;
    }
    if (!profile) {
      return Response.json({ detail: "Informe clientProfile ou clientProfileId." }, { status: 422 });
    }

    const ctx = await getCloudflareContext();
    const env = ctx.env as unknown as Record<string, string | undefined>;
    const readEnv = (key: string) => env[key] ?? process.env[key];

    const structure = await buildStructure(readEnv, { tabs, profile, objetivo: "search" });
    return Response.json(structure);
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : "Erro ao montar estrutura." },
      { status: 500 }
    );
  }
}
