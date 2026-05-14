import json
import logging
from typing import Any

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


_CATEGORIZE_CHUNK_SIZE = 50


def _categorize_chunk(
    chunk_pairs: list[tuple[int, str]],
    seed_keywords: list[str],
    existing_categories: list[str],
) -> dict[str, list[int]]:
    seed_str = ", ".join(seed_keywords[:10])
    kw_list = "\n".join(f"{kw_id}|{kw}" for kw_id, kw in chunk_pairs)
    valid_ids = {kw_id for kw_id, _ in chunk_pairs}

    preferred_block = ""
    if existing_categories:
        preferred_block = (
            "\n\nCategorias já existentes deste estudo (REUTILIZE quando a keyword se encaixar; "
            "só crie nova categoria se realmente nenhuma servir):\n"
            + "\n".join(f"- {c}" for c in existing_categories)
        )

    messages = [
        {
            "role": "system",
            "content": (
                "Você é especialista em Google Ads e estratégia de palavras-chave para campanhas brasileiras. "
                "Agrupe keywords em categorias temáticas coerentes, ligadas ao tema central das seeds. "
                "Não crie categorias para termos fora do nicho (ex.: velocidade de internet, jogos, "
                "paternidade ou outros temas sem relação direta com as seeds). "
                "Se uma keyword não combinar com o tema, agrupe em uma categoria 'Fora do Tema'.\n\n"
                "REGRAS CRÍTICAS:\n"
                "1. Cada keyword vem como `ID|texto`. Você DEVE referenciar a keyword pelo ID numérico, NUNCA pelo texto.\n"
                "2. NÃO invente IDs. Use apenas IDs presentes na lista.\n"
                "3. Toda keyword (todo ID) deve aparecer em exatamente UMA categoria.\n"
                "4. Nomes de categoria em português, curtos (2-4 palavras), sem emoji.\n"
                "5. Crie entre 3 e 10 categorias para o lote.\n"
                "Responda APENAS com JSON: {\"categorias\": {\"Nome\": [id1, id2, ...]}}"
            ),
        },
        {
            "role": "user",
            "content": (
                f"Tema central: {seed_str}{preferred_block}\n\n"
                f"Agrupe as {len(chunk_pairs)} keywords abaixo (formato `ID|texto`):\n\n"
                f"{kw_list}"
            ),
        },
    ]
    raw = _chat(messages, temperature=0.1)
    try:
        parsed = json.loads(raw)
    except Exception:
        logger.exception("Falha ao parsear categorias da IA: %s", raw[:500])
        return {}

    categories_raw = parsed.get("categorias", parsed)
    if not isinstance(categories_raw, dict):
        return {}

    result: dict[str, list[int]] = {}
    for cat_name, ids in categories_raw.items():
        if not isinstance(cat_name, str) or not isinstance(ids, list):
            continue
        clean_name = cat_name.strip()
        if not clean_name:
            continue
        valid_chunk_ids: list[int] = []
        for raw_id in ids:
            try:
                int_id = int(raw_id)
            except (TypeError, ValueError):
                continue
            if int_id in valid_ids:
                valid_chunk_ids.append(int_id)
        if valid_chunk_ids:
            result.setdefault(clean_name, []).extend(valid_chunk_ids)
    return result


def categorize_items(items: list[Any], seed_keywords: list[str]) -> dict[str, list[str]]:
    """
    Hybrid categorizer: groups items by Google KEYWORD_CONCEPT when present,
    falls back to LLM (ID-protocol) for unannotated items.
    Items must expose .name and .google_concept_group attributes.
    """
    google_buckets: dict[str, list[str]] = {}
    unannotated: list[str] = []

    for it in items:
        group = getattr(it, "google_concept_group", None)
        name = getattr(it, "name", None)
        if not isinstance(name, str) or not name.strip():
            continue
        if isinstance(group, str) and group.strip():
            google_buckets.setdefault(group.strip(), []).append(name)
        else:
            unannotated.append(name)

    if unannotated:
        llm_buckets = categorize_keywords(unannotated, seed_keywords)
        for cat, names in llm_buckets.items():
            google_buckets.setdefault(cat, []).extend(names)

    return {cat: names for cat, names in google_buckets.items() if names}


def categorize_keywords(keyword_names: list[str], seed_keywords: list[str]) -> dict[str, list[str]]:
    if not keyword_names:
        return {}

    id_to_name: dict[int, str] = {idx: name for idx, name in enumerate(keyword_names)}
    pairs = list(id_to_name.items())

    merged: dict[str, list[int]] = {}
    assigned_ids: set[int] = set()

    for start in range(0, len(pairs), _CATEGORIZE_CHUNK_SIZE):
        chunk = pairs[start : start + _CATEGORIZE_CHUNK_SIZE]
        existing = list(merged.keys())
        chunk_result = _categorize_chunk(chunk, seed_keywords, existing)

        for cat_name, ids in chunk_result.items():
            bucket = merged.setdefault(cat_name, [])
            for kw_id in ids:
                if kw_id in assigned_ids:
                    continue
                assigned_ids.add(kw_id)
                bucket.append(kw_id)

    leftover = [kw_id for kw_id in id_to_name if kw_id not in assigned_ids]
    if leftover:
        merged.setdefault("Outros", []).extend(leftover)

    return {
        cat: [id_to_name[kw_id] for kw_id in ids if kw_id in id_to_name]
        for cat, ids in merged.items()
        if ids
    }


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
