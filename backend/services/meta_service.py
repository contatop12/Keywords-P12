import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from fastapi import HTTPException

from backend.core.config import settings
from backend.schemas.meta import InterestItem
from backend.services.relevance_agent import KeywordRelevanceAgent

logger = logging.getLogger(__name__)


class MetaInterestService:
    def __init__(self) -> None:
        self.ad_account_id = settings.meta_ad_account_id.replace("act_", "").strip()
        self.search_url = f"https://graph.facebook.com/{settings.meta_api_version}/search"
        self.targeting_search_url = (
            f"https://graph.facebook.com/{settings.meta_api_version}/"
            f"act_{self.ad_account_id}/targetingsearch"
            if self.ad_account_id
            else ""
        )
        self.delivery_estimate_url = (
            f"https://graph.facebook.com/{settings.meta_api_version}/"
            f"act_{self.ad_account_id}/delivery_estimate"
            if self.ad_account_id
            else ""
        )
        self.relevance_agent = KeywordRelevanceAgent(threshold=settings.relevance_threshold)

    def _request_meta(self, url: str, params: dict[str, str | int]) -> requests.Response:
        return requests.get(
            url,
            params=params,
            timeout=settings.request_timeout_seconds,
        )

    def _extract_audience_size(self, raw_item: dict) -> int | None:
        direct = raw_item.get("audience_size")
        if isinstance(direct, int):
            return direct

        lower = raw_item.get("audience_size_lower_bound")
        upper = raw_item.get("audience_size_upper_bound")
        if isinstance(lower, int) and isinstance(upper, int):
            return int((lower + upper) / 2)

        return None

    def _fetch_interest_delivery_estimate(
        self,
        interest_id: str,
        interest_name: str,
        country: str,
    ) -> int | None:
        if not self.delivery_estimate_url:
            return None

        targeting_spec = {
            "geo_locations": {"countries": [country]},
            "flexible_spec": [{"interests": [{"id": interest_id, "name": interest_name}]}],
        }

        params = {
            "targeting_spec": json.dumps(targeting_spec, ensure_ascii=False),
            "optimization_goal": "REACH",
            "access_token": settings.access_token,
        }

        response = self._request_meta(self.delivery_estimate_url, params)
        if response.status_code >= 400:
            logger.warning(
                "delivery_estimate falhou para interest_id=%s status=%s",
                interest_id,
                response.status_code,
            )
            return None

        payload = response.json()
        data = payload.get("data", [])
        if not data:
            return None

        first = data[0] if isinstance(data, list) else {}

        # Campos variam conforme conta/objetivo da Meta.
        for key in [
            "estimate_mau",
            "estimate_dau",
            "users",
            "estimate_mau_upper_bound",
            "estimate_dau_upper_bound",
        ]:
            value = first.get(key)
            if isinstance(value, int):
                return value

        lower = first.get("estimate_mau_lower_bound")
        upper = first.get("estimate_mau_upper_bound")
        if isinstance(lower, int) and isinstance(upper, int):
            return int((lower + upper) / 2)

        return None

    def _enrich_with_audience_estimates(
        self,
        interests: list[InterestItem],
        country: str,
    ) -> None:
        missing = [item for item in interests if item.audience_size is None and item.id and item.name]
        if not missing or not self.delivery_estimate_url:
            return

        logger.info(
            "Enriquecendo audiencia para %s interesses via delivery_estimate.",
            len(missing),
        )

        max_workers = min(8, max(1, len(missing)))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    self._fetch_interest_delivery_estimate,
                    item.id,
                    item.name,
                    country,
                ): item
                for item in missing
            }
            for future in as_completed(futures):
                item = futures[future]
                try:
                    estimate = future.result()
                    if isinstance(estimate, int):
                        item.audience_size = estimate
                except requests.RequestException:
                    logger.warning(
                        "Falha de rede no delivery_estimate para interest_id=%s",
                        item.id,
                    )
                except Exception:
                    logger.exception(
                        "Erro inesperado ao enriquecer audiencia para interest_id=%s",
                        item.id,
                    )

    def search_interests(self, keyword: str, country: str, limit: int) -> list[InterestItem]:
        if not settings.access_token:
            raise HTTPException(
                status_code=500,
                detail="Token nao configurado. Defina ACCESS_TOKEN ou META_ACCESS_TOKEN no .env.",
            )

        params = {
            "type": "adinterest",
            "q": keyword,
            "limit": limit,
            "locale": settings.meta_locale,
            "country_code": country,
            "access_token": settings.access_token,
        }

        logger.info("Consultando Meta API para keyword='%s' com limit=%s", keyword, limit)

        response: requests.Response | None = None
        source = "search"

        # targetingsearch tende a refletir melhor o Direcionamento Detalhado do Ads Manager.
        if self.targeting_search_url:
            try:
                response = self._request_meta(self.targeting_search_url, params)
                source = "targetingsearch"
                if response.status_code >= 400:
                    logger.warning(
                        "targetingsearch falhou (status=%s). Fallback para /search.",
                        response.status_code,
                    )
                    response = None
            except requests.RequestException:
                logger.warning("Falha de rede no targetingsearch. Tentando fallback /search.")
                response = None

        if response is None:
            try:
                response = self._request_meta(self.search_url, params)
                source = "search"
            except requests.RequestException as exc:
                logger.exception("Erro de rede ao consultar Meta API.")
                raise HTTPException(
                    status_code=502,
                    detail="Falha de comunicacao com a Meta API.",
                ) from exc

        if response.status_code >= 400:
            logger.error(
                "Meta API retornou erro no source=%s. status=%s body=%s",
                source,
                response.status_code,
                response.text,
            )
            raise HTTPException(
                status_code=502,
                detail="Meta API retornou erro. Verifique token/permissoes.",
            )

        payload = response.json()
        raw_items = payload.get("data", [])

        normalized: list[InterestItem] = []
        for item in raw_items:
            normalized.append(
                InterestItem(
                    id=str(item.get("id", "")),
                    name=item.get("name", ""),
                    audience_size=self._extract_audience_size(item),
                    type=item.get("type"),
                    path=item.get("path", []),
                )
            )

        if settings.relevance_filter_enabled:
            before_count = len(normalized)
            normalized = self.relevance_agent.filter_related(keyword, normalized)
            logger.info(
                "Filtro de relevancia aplicado: %s -> %s resultados (threshold=%s).",
                before_count,
                len(normalized),
                settings.relevance_threshold,
            )

        self._enrich_with_audience_estimates(normalized, country)

        logger.info(
            "Meta API retornou %s interesses para country=%s via %s",
            len(normalized),
            country,
            source,
        )
        return normalized
