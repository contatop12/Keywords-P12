import { getCloudflareContext } from "@opennextjs/cloudflare";
import { planKeywords } from "../../../../lib/server/keywordPlanner";

export async function POST(req: Request) {
  try {
    const brief = await req.json();

    if (!brief?.cliente?.trim() || !brief?.especialidade?.trim()) {
      return Response.json(
        { detail: "Preencha ao menos Cliente e Especialidade." },
        { status: 422 }
      );
    }

    const ctx = await getCloudflareContext();
    const env = ctx.env as unknown as Record<string, string | undefined>;
    const readEnv = (key: string) => env[key] ?? process.env[key];

    const result = await planKeywords(readEnv, brief);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : "Erro ao gerar plano de keywords." },
      { status: 500 }
    );
  }
}
