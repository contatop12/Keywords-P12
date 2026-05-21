const SYSTEM_PROMPT =
  "Você é consultor sênior de Google Ads especializado em geração de leads para serviços médicos premium e locais. " +
  "Pense como gestor de tráfego experiente, orientado a performance, CAC, qualificação de lead e intenção de " +
  "agendamento. Sua tarefa: dado o briefing do cliente, gerar clusters de palavras-chave prontas para campanhas " +
  "Google Ads Search. Foque em termos com intenção comercial real (priorize quem está mais perto de agendar " +
  "consulta/comprar).\n\n" +
  "REGRAS CRÍTICAS:\n" +
  "1. Cada cluster vira uma ABA do estudo Google Ads.\n" +
  "2. Cada cluster tem entre 5 e 15 seeds (palavras de partida que serão expandidas pelo Planejador Google).\n" +
  "3. Inclua head terms + long tails + sinônimos + variações geográficas + 'perto de mim' quando fizer sentido.\n" +
  "4. Elimine termos puramente informacionais (ex: 'o que é diabetes', 'como funciona ozempic').\n" +
  "5. Sempre crie um cluster 'Geral' agregando os termos centrais do nicho do cliente.\n" +
  "6. Se o cliente atua local, crie cluster 'Geolocalização' com variações de bairro/cidade/região + 'perto de mim'.\n" +
  "7. Se houver concorrentes citados, crie 1 cluster 'Concorrentes' (resumo) + 1 cluster por concorrente (nome próprio + variações).\n" +
  "8. Crie cluster 'Institucional' com variações do nome próprio do cliente.\n" +
  "9. Para cada serviço/tema declarado, crie um cluster específico.\n" +
  "10. Nomes de cluster em português, curtos (max 31 chars), SEM os caracteres /\\?*[]: (proibidos no Excel).\n" +
  "11. Sinalize seeds com possível restrição de política (ex: ozempic, mounjaro, semaglutida) em clusters separados com observacao explícita.\n\n" +
  'Responda APENAS com JSON neste formato exato:\n' +
  '{\n' +
  '  "estrategia": "Resumo curto (2-4 frases) da abordagem geral.",\n' +
  '  "clusters": [\n' +
  '    {\n' +
  '      "nome": "Nome da aba (max 31 chars)",\n' +
  '      "intencao": "alta",\n' +
  '      "prioridade": 1,\n' +
  '      "seeds": ["seed 1", "seed 2"],\n' +
  '      "observacao": "Recomendação curta sobre essa aba."\n' +
  '    }\n' +
  '  ]\n' +
  '}';

const INVALID_SHEET_CHARS = /[\\/*?:[\]]/g;

type ReadEnv = (key: string) => string | undefined;

export interface PlanBrief {
  cliente?: string;
  especialidade?: string;
  urls?: string[];
  localizacao?: string;
  objetivo?: string;
  servicos?: string[];
  concorrentes?: string[];
  observacoes?: string;
  negativar?: string;
}

export interface PlanCluster {
  nome: string;
  intencao: "alta" | "media" | "baixa";
  prioridade: number;
  seeds: string[];
  observacao: string;
}

export interface PlanResult {
  estrategia: string;
  clusters: PlanCluster[];
}

function buildUserMessage(brief: PlanBrief): string {
  const cliente = (brief.cliente ?? "").trim() || "Cliente sem nome";
  const especialidade = (brief.especialidade ?? "").trim() || "Não informado";
  const rawUrls = (brief.urls ?? []).map((u) => u.trim()).filter(Boolean);
  const urlsStr = rawUrls.length ? rawUrls.map((u) => `- ${u}`).join("\n") : "-";
  const localizacao = (brief.localizacao ?? "").trim() || "Brasil";
  const objetivo = (brief.objetivo ?? "Geração de leads para consulta").trim();
  const servicos = (brief.servicos ?? []).map((s) => s.trim()).filter(Boolean);
  const concorrentes = (brief.concorrentes ?? []).map((c) => c.trim()).filter(Boolean);
  const observacoes = (brief.observacoes ?? "").trim();
  const negativar = (brief.negativar ?? "").trim();

  const parts: string[] = [
    `CLIENTE: ${cliente}`,
    `ESPECIALIDADE / NICHO: ${especialidade}`,
    `SITES DO CLIENTE:\n${urlsStr}`,
    `LOCALIZAÇÃO: ${localizacao}`,
    `OBJETIVO: ${objetivo}`,
  ];

  if (servicos.length) {
    parts.push("SERVIÇOS / TEMAS A COBRIR:\n- " + servicos.join("\n- "));
  } else {
    parts.push("SERVIÇOS / TEMAS: (nenhum declarado — sugira clusters padrão do nicho)");
  }
  if (concorrentes.length) {
    parts.push("CONCORRENTES (criar aba por nome):\n- " + concorrentes.join("\n- "));
  }
  if (observacoes) {
    parts.push(`OBSERVAÇÕES LIVRES:\n${observacoes}`);
  }
  if (negativar) {
    parts.push(`TERMOS PARA NEGATIVAR (NÃO incluir nas seeds, evitar esses contextos):\n${negativar}`);
  }
  return parts.join("\n\n");
}

function sanitizeCluster(raw: unknown): PlanCluster | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const nome = typeof r.nome === "string" ? r.nome : null;
  const seeds = Array.isArray(r.seeds) ? r.seeds : null;
  if (!nome || !seeds) return null;

  const nomeClean = nome.replace(INVALID_SHEET_CHARS, " ").trim().slice(0, 31);
  if (!nomeClean) return null;

  const seedsClean: string[] = [];
  const seen = new Set<string>();
  for (const seed of seeds) {
    if (typeof seed !== "string") continue;
    const s = seed.trim();
    if (!s || s.length > 80) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    seedsClean.push(s);
    if (seedsClean.length >= 15) break;
  }
  if (!seedsClean.length) return null;

  const intencaoRaw = r.intencao;
  const intencao: PlanCluster["intencao"] =
    intencaoRaw === "alta" || intencaoRaw === "media" || intencaoRaw === "baixa" ? intencaoRaw : "media";

  const prioridadeRaw = Number(r.prioridade);
  const prioridade = isNaN(prioridadeRaw) ? 3 : Math.max(1, Math.min(5, Math.round(prioridadeRaw)));

  const observacao = typeof r.observacao === "string" ? r.observacao.trim().slice(0, 240) : "";

  return { nome: nomeClean, intencao, prioridade, seeds: seedsClean, observacao };
}

export async function planKeywords(readEnv: ReadEnv, brief: PlanBrief): Promise<PlanResult> {
  const apiKey = (readEnv("OPENROUTER_API_KEY") ?? "").trim();
  const baseUrl = (readEnv("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").trim();
  const model = (readEnv("OPENROUTER_MODEL") ?? "google/gemini-flash-1.5").trim();

  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurado");

  const userMessage = buildUserMessage(brief);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://keywords-p12.workers.dev",
      "X-Title": "Keywords P12",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter falhou: ${text}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter retornou resposta vazia.");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { estrategia: "", clusters: [] };
  }

  const estrategia = typeof parsed.estrategia === "string" ? parsed.estrategia.trim() : "";
  const clustersRaw = Array.isArray(parsed.clusters) ? parsed.clusters : [];

  const clusters: PlanCluster[] = [];
  const usedNames = new Set<string>();

  for (const entry of clustersRaw) {
    const cluster = sanitizeCluster(entry);
    if (!cluster) continue;

    let candidate = cluster.nome;
    let counter = 2;
    while (usedNames.has(candidate)) {
      const suffix = ` (${counter})`;
      candidate = cluster.nome.slice(0, 31 - suffix.length) + suffix;
      counter++;
    }
    cluster.nome = candidate;
    usedNames.add(candidate);
    clusters.push(cluster);
  }

  clusters.sort((a, b) => {
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
    const order = { alta: 0, media: 1, baixa: 2 };
    return order[a.intencao] - order[b.intencao];
  });

  return { estrategia, clusters };
}
