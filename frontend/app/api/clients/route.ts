import { getKV, readIndex, writeIndex } from "../../../lib/server/kv";
import type { ClientProfile, ClientProfileIndexEntry } from "../../../lib/types";

const INDEX_KEY = "clients-index";

function indexEntry(p: ClientProfile): ClientProfileIndexEntry {
  return {
    id: p.id,
    nome_empresa: p.nome_empresa,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

export async function GET() {
  try {
    const kv = await getKV();
    const index = await readIndex<ClientProfileIndexEntry>(kv, INDEX_KEY);
    return Response.json(index);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const kv = await getKV();
    const body = (await req.json()) as Partial<ClientProfile>;
    const now = new Date().toISOString();
    const id = body.id || crypto.randomUUID();

    const profile: ClientProfile = {
      id,
      created_at: body.created_at || now,
      updated_at: now,
      nome_empresa: body.nome_empresa ?? "",
      urls_finais: body.urls_finais ?? [],
      telefone: body.telefone ?? "",
      endereco: body.endereco ?? "",
      horario_funcionamento: body.horario_funcionamento ?? "",
      locais: body.locais ?? [],
      idioma: body.idioma ?? "pt",
      marcas: body.marcas ?? [],
      servicos: body.servicos ?? [],
      precos: body.precos ?? [],
      promocao: body.promocao ?? null,
      orcamento_diario: body.orcamento_diario ?? 0,
      estrategia_lance: body.estrategia_lance ?? "maximizar_conversoes",
      acoes_conversao: body.acoes_conversao ?? [],
    };

    if (!profile.nome_empresa.trim()) {
      return Response.json({ error: "nome_empresa é obrigatório." }, { status: 422 });
    }

    await kv.put(`client:${id}`, JSON.stringify(profile));

    const index = await readIndex<ClientProfileIndexEntry>(kv, INDEX_KEY);
    const newIndex = [indexEntry(profile), ...index.filter((e) => e.id !== id)];
    await writeIndex(kv, INDEX_KEY, newIndex);

    return Response.json({ ok: true, id });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
