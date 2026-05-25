import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

from fastapi import HTTPException

from backend.services.google_service import GoogleKeywordService

logger = logging.getLogger(__name__)

_google_service = GoogleKeywordService()
_MAX_WORKERS = 6


def _run_single_tab(
    name: str,
    seeds: list[str],
    locations: list[str],
    country: str,
    limit: int,
) -> dict:
    cleaned_seeds = [seed.strip() for seed in seeds if seed and seed.strip()]
    if not cleaned_seeds:
        return {"name": name, "seeds": [], "items": [], "error": "Sem seeds validas."}

    try:
        items = _google_service.search_keywords(
            keywords=cleaned_seeds,
            country=country,
            limit=limit,
            locations=locations,
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        logger.exception("Falha ao gerar aba %s", name)
        return {"name": name, "seeds": cleaned_seeds, "items": [], "error": detail}
    except Exception as exc:
        logger.exception("Falha ao gerar aba %s", name)
        return {"name": name, "seeds": cleaned_seeds, "items": [], "error": str(exc)}

    return {
        "name": name,
        "seeds": cleaned_seeds,
        "items": [item.model_dump() for item in items],
    }


def generate_multi_study(
    tabs: list[dict],
    default_locations: list[str],
    default_country: str,
    default_limit: int,
) -> dict:
    if not tabs:
        return {
            "id": str(uuid.uuid4()),
            "created_at": datetime.utcnow().isoformat(),
            "country": default_country,
            "default_locations": default_locations,
            "tabs": [],
        }

    futures = {}
    ordered_results: dict[int, dict] = {}

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        for index, tab in enumerate(tabs):
            name = (tab.get("name") or f"Aba {index + 1}").strip()
            seeds = tab.get("seeds") or []
            locations = tab.get("locations") or default_locations
            country = (tab.get("country") or default_country).upper()
            limit = int(tab.get("limit") or default_limit)
            future = executor.submit(_run_single_tab, name, seeds, locations, country, limit)
            futures[future] = index

        for future in as_completed(futures):
            idx = futures[future]
            ordered_results[idx] = future.result()

    return {
        "id": str(uuid.uuid4()),
        "created_at": datetime.utcnow().isoformat(),
        "country": default_country,
        "default_locations": default_locations,
        "tabs": [ordered_results[i] for i in sorted(ordered_results.keys())],
    }
