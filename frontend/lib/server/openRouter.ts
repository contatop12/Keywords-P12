type ReadEnv = (key: string) => string | undefined;

type ChatMessage = { role: "system" | "user"; content: string };

function readOpenRouterConfig(readEnv: ReadEnv) {
  return {
    apiKey: readEnv("OPENROUTER_API_KEY") ?? "",
    baseUrl: readEnv("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1",
    model: readEnv("OPENROUTER_MODEL") ?? "google/gemini-flash-1.5",
  };
}

async function chat(readEnv: ReadEnv, messages: ChatMessage[], temperature = 0.2): Promise<string> {
  const config = readOpenRouterConfig(readEnv);
  if (!config.apiKey) {
    throw new Error("OPENROUTER_API_KEY nao configurado");
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://keywords-p12.workers.dev",
      "X-Title": "Keywords P12",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter falhou: ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter retornou resposta vazia.");
  }
  return content;
}

export type ChatMsg = ChatMessage;

// Wrapper exportado para chamadas JSON genéricas (ex.: builder de campanha).
export async function chatJson(
  readEnv: ReadEnv,
  messages: ChatMessage[],
  temperature = 0.3
): Promise<string> {
  return chat(readEnv, messages, temperature);
}

export async function classifyKeywordIntent(
  readEnv: ReadEnv,
  keywordNames: string[],
  seedKeywords: string[],
  niche: string
): Promise<Record<string, boolean>> {
  // Retorna { keyword: true } quando a palavra DEVE ser negativada (sem intenção
  // comercial ligada ao nicho). Ausência da chave = manter (não negativar).
  if (!keywordNames.length) {
    return {};
  }

  const config = readOpenRouterConfig(readEnv);
  if (!config.apiKey) {
    // Sem chave: não derruba a avaliação — apenas pula o gate.
    return {};
  }

  const seedStr = seedKeywords.slice(0, 10).join(", ");
  const result: Record<string, boolean> = {};
  const CHUNK = 60;

  for (let start = 0; start < keywordNames.length; start += CHUNK) {
    const chunk = keywordNames.slice(start, start + CHUNK);
    const idToName = new Map<number, string>();
    chunk.forEach((name, i) => idToName.set(start + i, name));
    const kwList = [...idToName.entries()].map(([id, kw]) => `${id}|${kw}`).join("\n");

    let raw: string;
    try {
      raw = await chat(
        readEnv,
        [
          {
            role: "system",
            content:
              "Você é especialista em Google Ads. Sua tarefa é identificar palavras-chave SEM " +
              "intenção comercial ligada ao nicho do anunciante (devem ser negativadas). " +
              "Negative quando a palavra for: informacional pura (o que é, sintomas, significado), " +
              "produto/serviço errado, fora do tema do nicho, busca por emprego/curso/salário, " +
              "gratuito/SUS/convênio quando não é o foco, ou marca de terceiros irrelevante. " +
              "NÃO negative termos com intenção comercial no nicho, mesmo que sejam de marca/" +
              "concorrente relevante ao nicho. Na dúvida, NÃO negative. " +
              "Cada item vem como `ID|texto`. Responda APENAS com JSON: " +
              '{"negativar": [id1, id2, ...]} contendo só os IDs a negativar.',
          },
          {
            role: "user",
            content:
              `Nicho do anunciante: ${niche || seedStr || "(não informado)"}\n` +
              `Tema central (seeds): ${seedStr || "(não informado)"}\n\n` +
              `Avalie as ${chunk.length} palavras (formato \`ID|texto\`):\n\n${kwList}`,
          },
        ],
        0.0
      );
    } catch {
      // Falha no lote: não negativa nada por intenção nesse lote.
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as { negativar?: unknown };
      const ids = Array.isArray(parsed.negativar) ? parsed.negativar : [];
      for (const rawId of ids) {
        const id = typeof rawId === "number" ? rawId : Number.parseInt(String(rawId), 10);
        const name = idToName.get(id);
        if (name) result[name] = true;
      }
    } catch {
      continue;
    }
  }

  return result;
}

export async function categorizeKeywords(
  readEnv: ReadEnv,
  keywordNames: string[],
  seedKeywords: string[]
): Promise<Record<string, string[]>> {
  if (!keywordNames.length) {
    return {};
  }

  const seedStr = seedKeywords.slice(0, 10).join(", ");
  const kwList = keywordNames
    .slice(0, 300)
    .map((keyword) => `- ${keyword}`)
    .join("\n");

  const raw = await chat(
    readEnv,
    [
      {
        role: "system",
        content:
          "Você é especialista em Google Ads e estratégia de palavras-chave para campanhas brasileiras. " +
          "Agrupe apenas keywords relacionadas ao tema central das seeds. " +
          "Não crie categorias para termos fora do nicho (ex.: velocidade de internet, jogos, " +
          "paternidade ou outros temas sem relação direta com as seeds). " +
          "Se uma keyword não combinar com o tema, omita-a das categorias. " +
          'Responda APENAS com JSON válido no formato: {"categorias": {"Nome da Categoria": ["keyword1", "keyword2", ...]}}. ' +
          "Use nomes de categorias em português, curtos (2-4 palavras). " +
          "Crie entre 3 e 12 categorias. Toda keyword deve aparecer em exatamente uma categoria.",
      },
      {
        role: "user",
        content:
          `Tema central: ${seedStr}\n\n` +
          `Agrupe as ${keywordNames.length} keywords abaixo em categorias para uma campanha Google Ads:\n\n` +
          kwList,
      },
    ],
    0.2
  );

  try {
    const parsed = JSON.parse(raw) as { categorias?: Record<string, string[]> } | Record<string, string[]>;
    const categories = "categorias" in parsed ? parsed.categorias : parsed;
    if (!categories || typeof categories !== "object") {
      return {};
    }
    const output: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(categories)) {
      if (Array.isArray(value)) {
        output[key] = value.filter((item) => typeof item === "string");
      }
    }
    return output;
  } catch {
    return {};
  }
}
