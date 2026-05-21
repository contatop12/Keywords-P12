import json
import logging
import re
from dataclasses import dataclass, field

import requests
from fastapi import HTTPException

from backend.core.config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """Você é AGEBRI — Agente de Briefing para Google Ads.
Sua função é analisar o briefing de um negócio e retornar categorias de palavras-chave relevantes para campanhas no Google Ads.

Regras:
- Gere entre 5 e 12 categorias temáticas
- Cada categoria deve ter entre 3 e 8 palavras-chave seed (termos curtos, 1–3 palavras)
- As palavras devem ser em português brasileiro
- Foque em intenção de compra/contratação (não informacional)
- Considere os concorrentes para identificar termos do segmento
- Use o campo "Restringir/Negativar" para NÃO incluir esses termos nas categorias
- Retorne SOMENTE JSON válido, sem markdown, sem texto fora do JSON

Formato de resposta (JSON puro):
{
  "categories": [
    {"name": "Nome da Categoria", "keywords": ["palavra1", "palavra2", "palavra3"]},
    ...
  ],
  "restrict_suggestions": ["termo1", "termo2"]
}"""


@dataclass
class AgebriCategory:
    name: str
    keywords: list[str] = field(default_factory=list)


@dataclass
class AgebriResult:
    categories: list[AgebriCategory] = field(default_factory=list)
    restrict_suggestions: list[str] = field(default_factory=list)


def _build_user_prompt(briefing: dict) -> str:
    lines = ["Analise o briefing abaixo e gere as categorias de palavras-chave:\n"]
    if briefing.get("company_name"):
        lines.append(f"**Empresa:** {briefing['company_name']}")
    if briefing.get("niche"):
        lines.append(f"**Especialidade/Nicho:** {briefing['niche']}")
    if briefing.get("description"):
        lines.append(f"**Sobre a empresa:** {briefing['description']}")
    if briefing.get("services"):
        lines.append(f"**Principais serviços:** {briefing['services']}")
    if briefing.get("target_audience"):
        lines.append(f"**Público-alvo:** {briefing['target_audience']}")
    if briefing.get("main_objective"):
        lines.append(f"**Objetivo principal:** {briefing['main_objective']}")
    if briefing.get("competitors"):
        lines.append(f"**Concorrentes:** {briefing['competitors']}")
    if briefing.get("observations"):
        lines.append(f"**Observações livres:** {briefing['observations']}")
    if briefing.get("urls"):
        urls = [u for u in briefing["urls"] if u and u.strip()]
        if urls:
            lines.append(f"**URLs para análise:** {', '.join(urls)}")
    if briefing.get("restrict_keywords"):
        lines.append(f"**Restringir/Negativar (NÃO incluir):** {briefing['restrict_keywords']}")
    return "\n".join(lines)


def _extract_json(text: str) -> dict:
    text = text.strip()
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError("Nenhum JSON encontrado na resposta do AGEBRI.")
    return json.loads(match.group(0))


def run_agebri(briefing: dict) -> AgebriResult:
    if not settings.openrouter_api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY não configurado.")

    user_prompt = _build_user_prompt(briefing)

    payload = {
        "model": settings.openrouter_model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.4,
        "max_tokens": 2000,
    }

    response = requests.post(
        f"{settings.openrouter_base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=60,
    )

    if response.status_code >= 400:
        logger.error("AGEBRI OpenRouter erro: status=%s body=%s", response.status_code, response.text)
        raise HTTPException(status_code=502, detail="AGEBRI: erro ao consultar modelo de IA.")

    content = response.json()["choices"][0]["message"]["content"]

    try:
        data = _extract_json(content)
    except (ValueError, json.JSONDecodeError, KeyError) as exc:
        logger.error("AGEBRI parse error: %s — raw: %s", exc, content[:500])
        raise HTTPException(status_code=502, detail="AGEBRI: resposta do modelo não pôde ser interpretada.")

    categories = [
        AgebriCategory(name=c.get("name", ""), keywords=c.get("keywords", []))
        for c in data.get("categories", [])
        if c.get("name")
    ]
    restrict_suggestions = data.get("restrict_suggestions", [])

    return AgebriResult(categories=categories, restrict_suggestions=restrict_suggestions)
