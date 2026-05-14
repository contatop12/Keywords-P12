import logging
import uuid
from datetime import datetime

from backend.schemas.meta import InterestItem
from backend.services import ai_service
from backend.services.google_service import GoogleKeywordService

logger = logging.getLogger(__name__)

_google_service = GoogleKeywordService()


def generate_study(
    keywords: list[str],
    locations: list[str],
    country: str,
    limit: int,
) -> dict:
    logger.info("Gerando estudo: %d keywords, locations=%s", len(keywords), locations)

    all_items: list[InterestItem] = _google_service.search_keywords(
        keywords=keywords,
        country=country,
        limit=limit,
        locations=locations,
    )

    keyword_names = [item.name for item in all_items]

    categories_map: dict[str, list[str]] = {}
    if keyword_names:
        try:
            categories_map = ai_service.categorize_keywords(keyword_names, seed_keywords=keywords)
        except Exception:
            logger.exception("Falha na categorizacao IA — usando categoria unica")
            categories_map = {"Geral": keyword_names}

    name_to_item: dict[str, InterestItem] = {item.name.lower(): item for item in all_items}
    category_items: dict[str, list[dict]] = {}
    for cat, cat_kws in categories_map.items():
        items_for_cat = [
            name_to_item[kw.lower()].model_dump()
            for kw in cat_kws
            if kw.lower() in name_to_item
        ]
        if items_for_cat:
            category_items[cat] = items_for_cat

    category_stats = [
        {
            "categoria": cat,
            "total_keywords": len(items),
            "media_searches": int(
                sum(i.get("media_pesquisas") or 0 for i in items) / max(len(items), 1)
            ),
            "top_keywords": [i["name"] for i in sorted(items, key=lambda x: x.get("media_pesquisas") or 0, reverse=True)[:5]],
        }
        for cat, items in category_items.items()
    ]

    insights: list[str] = []
    try:
        insights = ai_service.generate_insights(category_stats)
    except Exception:
        logger.exception("Falha ao gerar insights")

    ad_groups: dict[str, dict] = {}
    for cat, items in category_items.items():
        try:
            ad_groups[cat] = ai_service.generate_ad_groups(cat, [i["name"] for i in items])
        except Exception:
            logger.exception("Falha ao gerar ad group para categoria: %s", cat)
            ad_groups[cat] = {
                "nome": cat,
                "palavras_positivas": [i["name"] for i in items[:15]],
                "palavras_negativas": [],
                "extensoes": {"sitelinks": [], "callouts": []},
            }

    return {
        "id": str(uuid.uuid4()),
        "created_at": datetime.utcnow().isoformat(),
        "seed_keywords": keywords,
        "locations": locations,
        "country": country,
        "general": [item.model_dump() for item in all_items],
        "categories": category_items,
        "insights": insights,
        "ad_groups": ad_groups,
    }
