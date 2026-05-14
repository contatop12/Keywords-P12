import logging
import re
import uuid
from datetime import datetime

from backend.schemas.meta import InterestItem
from backend.services import ai_service
from backend.core.config import settings
from backend.services.google_service import GoogleKeywordService
from backend.services.relevance_agent import KeywordRelevanceAgent

logger = logging.getLogger(__name__)

_google_service = GoogleKeywordService()

_STOPWORDS = {
    "a",
    "as",
    "ao",
    "aos",
    "com",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "ou",
    "para",
    "por",
    "sem",
    "um",
    "uma",
    "uns",
    "umas",
}


def _tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[a-zà-ú0-9]+", text.lower())
    return [token for token in tokens if len(token) >= 4 and token not in _STOPWORDS]


def _filter_items_to_seeds(items: list[InterestItem], seed_keywords: list[str]) -> list[InterestItem]:
    if not items or not seed_keywords:
        return items

    agent = KeywordRelevanceAgent(threshold=settings.relevance_threshold)
    kept: dict[str, InterestItem] = {}
    for seed in seed_keywords:
        for item in agent.filter_related(seed, items):
            kept[item.id] = item

    if not kept:
        return items

    return list(kept.values())


def build_broaden_suggestions(
    seed_keywords: list[str],
    items: list[InterestItem],
    close_variants: list[str],
) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []

    def push(value: str) -> None:
        cleaned = value.strip()
        if len(cleaned) < 4:
            return
        key = cleaned.lower()
        if key in seen:
            return
        seen.add(key)
        ordered.append(cleaned)

    for variant in close_variants:
        push(variant)
    for seed in seed_keywords:
        push(seed)
        for token in _tokenize(seed):
            if len(token) >= 6:
                push(token)

    return ordered[:8]


def _categorize_items(
    items: list[InterestItem],
    seed_keywords: list[str],
) -> dict[str, list[InterestItem]]:
    keyword_names = [item.name for item in items]
    if not keyword_names:
        return {}

    try:
        categories_map = ai_service.categorize_keywords(keyword_names, seed_keywords=seed_keywords)
    except Exception:
        logger.exception("Falha na categorizacao IA — mantendo apenas aba Geral")
        return {}

    name_to_item = {item.name.lower(): item for item in items}
    category_items: dict[str, list[InterestItem]] = {}
    for category, names in categories_map.items():
        bucket: list[InterestItem] = []
        for name in names:
            item = name_to_item.get(name.lower())
            if item is not None:
                bucket.append(item)
        if bucket:
            category_items[category] = bucket
    return category_items


def run_discovery(
    keywords: list[str],
    locations: list[str],
    country: str,
    limit: int,
) -> dict:
    items, close_variants = _google_service.search_keywords_with_variants(
        keywords=keywords,
        country=country,
        limit=limit,
        locations=locations,
    )
    items = _filter_items_to_seeds(items, keywords)

    categories = _categorize_items(items, keywords)
    broaden_suggestions = build_broaden_suggestions(keywords, items, close_variants)

    return {
        "id": str(uuid.uuid4()),
        "created_at": datetime.utcnow().isoformat(),
        "seed_keywords": keywords,
        "locations": locations,
        "country": country,
        "general": [item.model_dump() for item in items],
        "categories": {name: [item.model_dump() for item in bucket] for name, bucket in categories.items()},
        "broaden_suggestions": broaden_suggestions,
        "results": [item.model_dump() for item in items],
    }
