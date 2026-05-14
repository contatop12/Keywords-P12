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
