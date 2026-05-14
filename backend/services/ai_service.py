import json
import logging

import requests

from backend.core.config import settings

logger = logging.getLogger(__name__)

_HEADERS_EXTRA = {
    "HTTP-Referer": "https://keywords-p12.workers.dev",
    "X-Title": "Keywords P12",
}


def _chat(messages: list[dict], temperature: float = 0.3) -> str:
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY nao configurado")
    response = requests.post(
        f"{settings.openrouter_base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
            **_HEADERS_EXTRA,
        },
        json={
            "model": settings.openrouter_model,
            "messages": messages,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        },
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


def categorize_keywords(keyword_names: list[str], seed_keywords: list[str]) -> dict[str, list[str]]:
    seed_str = ", ".join(seed_keywords[:10])
    kw_list = "\n".join(f"- {kw}" for kw in keyword_names[:300])
    messages = [
        {
            "role": "system",
            "content": (
                "Você é especialista em Google Ads e estratégia de palavras-chave para campanhas brasileiras. "
                "Agrupe apenas keywords relacionadas ao tema central das seeds. "
                "Não crie categorias para termos fora do nicho (ex.: velocidade de internet, jogos, "
                "paternidade ou outros temas sem relação direta com as seeds). "
                "Se uma keyword não combinar com o tema, omita-a das categorias. "
                "Responda APENAS com JSON válido no formato: "
                "{\"categorias\": {\"Nome da Categoria\": [\"keyword1\", \"keyword2\", ...]}}. "
                "Use nomes de categorias em português, curtos (2-4 palavras). "
                "Crie entre 3 e 12 categorias. Toda keyword deve aparecer em exatamente uma categoria."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Tema central: {seed_str}\n\n"
                f"Agrupe as {len(keyword_names)} keywords abaixo em categorias para uma campanha Google Ads:\n\n"
                f"{kw_list}"
            ),
        },
    ]
    raw = _chat(messages, temperature=0.2)
    try:
        parsed = json.loads(raw)
        categories: dict[str, list[str]] = parsed.get("categorias", parsed)
        if not isinstance(categories, dict):
            raise ValueError("resposta nao e dict")
        return {k: v for k, v in categories.items() if isinstance(v, list)}
    except Exception:
        logger.exception("Falha ao parsear categorias da IA: %s", raw[:500])
        return {"Geral": keyword_names}


def generate_insights(category_stats: list[dict]) -> list[str]:
    stats_str = json.dumps(category_stats, ensure_ascii=False, indent=2)
    messages = [
        {
            "role": "system",
            "content": (
                "Você é analista de mídia paga especializado em Google Ads para o mercado brasileiro. "
                "Gere insights acionáveis e estratégicos com base nos dados de volume e concorrência. "
                "Responda com JSON: {\"insights\": [\"insight1\", \"insight2\", ...]}. "
                "Máximo 6 insights, em português, cada um com no máximo 2 frases."
            ),
        },
        {
            "role": "user",
            "content": f"Dados do estudo de keywords:\n{stats_str}",
        },
    ]
    raw = _chat(messages, temperature=0.4)
    try:
        parsed = json.loads(raw)
        return parsed.get("insights", [])
    except Exception:
        logger.exception("Falha ao parsear insights: %s", raw[:500])
        return []


def generate_ad_groups(category: str, keywords: list[str]) -> dict:
    kw_str = "\n".join(f"- {kw}" for kw in keywords[:50])
    messages = [
        {
            "role": "system",
            "content": (
                "Você é especialista em Google Ads. Crie grupos de anúncios otimizados. "
                "Responda com JSON exato: "
                "{\"nome\": \"...\", \"palavras_positivas\": [...], "
                "\"palavras_negativas\": [...], "
                "\"extensoes\": {\"sitelinks\": [...], \"callouts\": [...]}}. "
                "palavras_positivas: as 15 mais relevantes. "
                "palavras_negativas: termos que não devem acionar o anúncio (max 20). "
                "sitelinks: 4 títulos de sitelink (max 25 chars cada). "
                "callouts: 4 textos de destaque (max 25 chars cada). Tudo em português."
            ),
        },
        {
            "role": "user",
            "content": f"Categoria: {category}\n\nKeywords disponíveis:\n{kw_str}",
        },
    ]
    raw = _chat(messages, temperature=0.3)
    try:
        return json.loads(raw)
    except Exception:
        logger.exception("Falha ao parsear ad group: %s", raw[:500])
        return {
            "nome": category,
            "palavras_positivas": keywords[:15],
            "palavras_negativas": [],
            "extensoes": {"sitelinks": [], "callouts": []},
        }
