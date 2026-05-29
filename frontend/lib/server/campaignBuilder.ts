import { chatJson } from "./openRouter";
import type {
  AnuncioRSA,
  ClientProfile,
  Correspondencia,
  Structure,
  StructureGroup,
  StructureKeyword,
  StructureRecursos,
  Sitelink,
  SnippetEstruturado,
} from "../types";

type ReadEnv = (key: string) => string | undefined;

type EvalItem = Record<string, unknown> & {
  name?: unknown;
  classificacao?: { tier?: string };
};
type InputTab = { name?: string; items?: EvalItem[] };

const LIMITS = {
  titulo: 30,
  descricao: 90,
  caminho: 15,
  sitelinkTexto: 25,
  sitelinkDesc: 35,
  frase: 25,
  snippet: 25,
  empresa: 25,
  promoTexto: 20,
  leadHeadline: 30,
};

function truncate(value: string, max: number, label: string, avisos: string[]): string {
  const s = (value ?? "").trim();
  if (s.length <= max) return s;
  avisos.push(`Truncado (${label}, >${max}): "${s.slice(0, 24)}…"`);
  return s.slice(0, max).trim();
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function tierOf(item: EvalItem): string {
  return item.classificacao?.tier ?? "";
}

function nameOf(item: EvalItem): string {
  return String(item.name ?? "").trim();
}

function slugPath(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.caminho);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string").map((v) => String(v)) : [];
}

function fallbackRSA(groupName: string, keywords: string[], profile: ClientProfile): AnuncioRSA {
  const empresa = profile.nome_empresa || "Especialistas";
  const titulosRaw = uniq([
    groupName,
    ...keywords.slice(0, 6).map((k) => k.charAt(0).toUpperCase() + k.slice(1)),
    empresa,
    "Atendimento Especializado",
    "Agende sua Avaliação",
    "Fale com um Especialista",
  ]);
  const servicos = profile.servicos.length ? profile.servicos.join(", ") : groupName;
  const descricoesRaw = uniq([
    `${empresa}: ${servicos}. Agende sua avaliação hoje mesmo.`,
    `Atendimento especializado em ${groupName}. Profissionais qualificados.`,
    profile.promocao?.texto ? `${profile.promocao.texto}. Condições especiais.` : `Qualidade e confiança em ${groupName}.`,
    profile.endereco ? `Estamos em ${profile.endereco}. Venha nos visitar.` : "Solicite mais informações agora.",
  ]);
  return {
    titulos: titulosRaw,
    descricoes: descricoesRaw,
    caminhos: uniq([slugPath(groupName), slugPath(profile.servicos[0] ?? "servicos")]),
  };
}

function enforceRSA(rsa: AnuncioRSA, avisos: string[], groupName: string): AnuncioRSA {
  const titulos = uniq(rsa.titulos)
    .map((t) => truncate(t, LIMITS.titulo, `título (${groupName})`, avisos))
    .filter(Boolean)
    .slice(0, 15);
  const descricoes = uniq(rsa.descricoes)
    .map((d) => truncate(d, LIMITS.descricao, `descrição (${groupName})`, avisos))
    .filter(Boolean)
    .slice(0, 4);
  const caminhos = uniq(rsa.caminhos)
    .map((c) => truncate(c, LIMITS.caminho, `caminho (${groupName})`, avisos))
    .filter(Boolean)
    .slice(0, 2);
  if (titulos.length < 3) avisos.push(`Grupo "${groupName}": menos de 3 títulos gerados.`);
  return { titulos, descricoes, caminhos };
}

async function generateRSA(
  readEnv: ReadEnv,
  groupName: string,
  keywords: string[],
  profile: ClientProfile,
  avisos: string[]
): Promise<AnuncioRSA> {
  let rsa: AnuncioRSA | null = null;
  try {
    const raw = await chatJson(
      readEnv,
      [
        {
          role: "system",
          content:
            "Você é especialista em Google Ads (Search) para o mercado brasileiro. " +
            "Crie a copy de um Responsive Search Ad para um grupo de anúncios. " +
            "Responda APENAS com JSON válido: " +
            '{"titulos": [..até 15, cada um ≤30 chars..], "descricoes": [..até 4, cada uma ≤90 chars..], ' +
            '"caminhos": [..até 2, cada um ≤15 chars..]}. ' +
            "Títulos persuasivos e variados (benefício, marca, CTA, urgência). " +
            "Respeite RIGOROSAMENTE os limites de caractere. Tudo em português.",
        },
        {
          role: "user",
          content:
            `Empresa: ${profile.nome_empresa}\n` +
            `Grupo de anúncios: ${groupName}\n` +
            `Serviços: ${profile.servicos.join(", ") || "-"}\n` +
            `Marcas: ${profile.marcas.join(", ") || "-"}\n` +
            `Promoção: ${profile.promocao?.texto ?? "-"}\n` +
            `Palavras-chave do grupo: ${keywords.slice(0, 20).join(", ")}`,
        },
      ],
      0.5
    );
    const obj = parseJsonObject(raw);
    if (obj) {
      rsa = {
        titulos: asStringArray(obj.titulos),
        descricoes: asStringArray(obj.descricoes),
        caminhos: asStringArray(obj.caminhos),
      };
    }
  } catch {
    rsa = null;
  }

  if (!rsa || rsa.titulos.length < 3) {
    if (!rsa) avisos.push(`Grupo "${groupName}": IA indisponível, copy gerada por fallback.`);
    rsa = fallbackRSA(groupName, keywords, profile);
  }
  return enforceRSA(rsa, avisos, groupName);
}

async function generateResources(
  readEnv: ReadEnv,
  profile: ClientProfile,
  groupNames: string[],
  avisos: string[]
): Promise<StructureRecursos> {
  const url = profile.urls_finais[0] ?? "";
  let sitelinks: Sitelink[] = [];
  let frases: string[] = [];
  let snippets: SnippetEstruturado[] = [];

  try {
    const raw = await chatJson(
      readEnv,
      [
        {
          role: "system",
          content:
            "Você é especialista em Google Ads. Gere recursos de campanha Search. " +
            "Responda APENAS com JSON válido: " +
            '{"sitelinks": [{"texto": "≤25", "desc1": "≤35", "desc2": "≤35"}] (4 itens), ' +
            '"frases_destaque": ["≤25"] (até 6), ' +
            '"snippets": [{"tipo": "Serviços|Marcas|Tipos", "valores": ["≤25"]}] (3 tipos)}. ' +
            "Respeite os limites de caractere. Tudo em português.",
        },
        {
          role: "user",
          content:
            `Empresa: ${profile.nome_empresa}\n` +
            `Serviços: ${profile.servicos.join(", ") || "-"}\n` +
            `Marcas: ${profile.marcas.join(", ") || "-"}\n` +
            `Grupos: ${groupNames.join(", ")}`,
        },
      ],
      0.5
    );
    const obj = parseJsonObject(raw);
    if (obj) {
      const rawSitelinks = Array.isArray(obj.sitelinks) ? obj.sitelinks : [];
      sitelinks = rawSitelinks
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
        .map((s) => ({
          texto: truncate(String(s.texto ?? ""), LIMITS.sitelinkTexto, "sitelink texto", avisos),
          desc1: truncate(String(s.desc1 ?? ""), LIMITS.sitelinkDesc, "sitelink desc1", avisos),
          desc2: truncate(String(s.desc2 ?? ""), LIMITS.sitelinkDesc, "sitelink desc2", avisos),
          url,
        }))
        .filter((s) => s.texto)
        .slice(0, 6);
      frases = uniq(asStringArray(obj.frases_destaque))
        .map((f) => truncate(f, LIMITS.frase, "frase de destaque", avisos))
        .filter(Boolean)
        .slice(0, 6);
      const rawSnip = Array.isArray(obj.snippets) ? obj.snippets : [];
      snippets = rawSnip
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
        .map((s) => ({
          tipo: String(s.tipo ?? "Serviços"),
          valores: uniq(asStringArray(s.valores))
            .map((v) => truncate(v, LIMITS.snippet, "snippet valor", avisos))
            .filter(Boolean)
            .slice(0, 10),
        }))
        .filter((s) => s.valores.length)
        .slice(0, 3);
    }
  } catch {
    avisos.push("IA indisponível para recursos; usando fallback do perfil.");
  }

  // Fallbacks determinísticos a partir do perfil.
  if (!frases.length && profile.servicos.length) {
    frases = uniq(profile.servicos)
      .map((s) => truncate(s, LIMITS.frase, "frase de destaque", avisos))
      .slice(0, 6);
  }
  if (!snippets.length) {
    const valores: SnippetEstruturado[] = [];
    if (profile.servicos.length)
      valores.push({
        tipo: "Serviços",
        valores: uniq(profile.servicos).map((v) => truncate(v, LIMITS.snippet, "snippet", avisos)).slice(0, 10),
      });
    if (profile.marcas.length)
      valores.push({
        tipo: "Marcas",
        valores: uniq(profile.marcas).map((v) => truncate(v, LIMITS.snippet, "snippet", avisos)).slice(0, 10),
      });
    snippets = valores;
  }

  return {
    sitelinks,
    frases_destaque: frases,
    snippets_estruturados: snippets,
    imagens: [],
    ligacao: { telefone: profile.telefone, horario: profile.horario_funcionamento },
    lead_form: {
      headline: truncate(`Fale com ${profile.nome_empresa}`, LIMITS.leadHeadline, "lead_form headline", avisos),
      empresa: truncate(profile.nome_empresa, LIMITS.empresa, "nome empresa", avisos),
    },
    promocao: profile.promocao
      ? {
          tipo: profile.promocao.tipo,
          valor: profile.promocao.valor,
          texto: profile.promocao.texto
            ? truncate(profile.promocao.texto, LIMITS.promoTexto, "promoção texto", avisos)
            : undefined,
        }
      : null,
    precos: profile.precos,
  };
}

export async function buildStructure(
  readEnv: ReadEnv,
  params: { tabs: InputTab[]; profile: ClientProfile; objetivo?: "search" }
): Promise<Structure> {
  const { tabs, profile } = params;
  const avisos: string[] = [];
  const correspondencia: Correspondencia = "frase";
  const urlFinal = profile.urls_finais[0] ?? "";

  const negativasSet = new Set<string>();
  const grupos: StructureGroup[] = [];

  for (const tab of tabs) {
    const items = tab.items ?? [];
    const aprovadas: string[] = [];
    for (const item of items) {
      const name = nameOf(item);
      if (!name) continue;
      if (tierOf(item) === "negativar") {
        negativasSet.add(name);
      } else {
        aprovadas.push(name);
      }
    }
    const keywords = uniq(aprovadas);
    if (!keywords.length) continue;

    const groupName = (tab.name ?? "Grupo").trim() || "Grupo";
    const rsa = await generateRSA(readEnv, groupName, keywords, profile, avisos);
    const structKeywords: StructureKeyword[] = keywords.map((texto) => ({ texto, correspondencia }));

    grupos.push({ nome: groupName, url_final: urlFinal, keywords: structKeywords, anuncio_rsa: rsa });
  }

  const recursos = await generateResources(
    readEnv,
    profile,
    grupos.map((g) => g.nome),
    avisos
  );

  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    client_profile_id: profile.id || null,
    client_name: profile.nome_empresa,
    objetivo: "search",
    status: "rascunho",
    veiculacao: "pausada",
    google_ads: { customer_id: null, campaign_resource_name: null },
    campanha: {
      nome: `${profile.nome_empresa || "Cliente"} — Search`,
      orcamento_diario: profile.orcamento_diario,
      estrategia_lance: profile.estrategia_lance,
      locais: profile.locais,
      idiomas: [profile.idioma || "pt"],
      rede: "search",
      agendamento: "todos os dias",
      conversoes: profile.acoes_conversao,
    },
    grupos,
    negativas_campanha: uniq([...negativasSet]),
    recursos,
    avisos,
  };
}
