import logging
import re
from datetime import datetime
from typing import Any

import requests
from fastapi import HTTPException

from backend.core.config import settings
from backend.schemas.meta import InterestItem
from backend.services.google_metrics import normalize_monthly_searches
from backend.services.relevance_agent import KeywordRelevanceAgent

logger = logging.getLogger(__name__)


class GoogleKeywordService:
    def __init__(self) -> None:
        customer_id = settings.google_ads_customer_id.replace("-", "").strip()
        self.customer_id = customer_id
        self.keyword_ideas_url = (
            f"https://googleads.googleapis.com/{settings.google_ads_api_version}/"
            f"customers/{customer_id}:generateKeywordIdeas"
            if customer_id
            else ""
        )
        self.relevance_agent = KeywordRelevanceAgent(threshold=settings.relevance_threshold)

    def _ensure_configured(self) -> None:
        required = {
            "GOOGLE_ADS_CLIENT_ID": settings.google_ads_client_id,
            "GOOGLE_ADS_CLIENT_SECRET": settings.google_ads_client_secret,
            "GOOGLE_ADS_REFRESH_TOKEN": settings.google_ads_refresh_token,
            "GOOGLE_ADS_DEVELOPER_TOKEN": settings.google_ads_developer_token,
            "GOOGLE_ADS_CUSTOMER_ID": settings.google_ads_customer_id,
        }
        missing = [key for key, value in required.items() if not value.strip()]
        if missing:
            raise HTTPException(
                status_code=500,
                detail=f"Google Ads nao configurado. Variaveis ausentes: {', '.join(missing)}",
            )

    def _get_access_token(self) -> str:
        token_url = "https://oauth2.googleapis.com/token"
        response = requests.post(
            token_url,
            data={
                "client_id": settings.google_ads_client_id,
                "client_secret": settings.google_ads_client_secret,
                "refresh_token": settings.google_ads_refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=settings.request_timeout_seconds,
        )
        if response.status_code >= 400:
            logger.error("Falha ao obter access token Google Ads: %s", response.text)
            raise HTTPException(
                status_code=502,
                detail="Falha ao autenticar com Google Ads (refresh token/client credentials).",
            )
        payload = response.json()
        token = payload.get("access_token", "")
        if not token:
            raise HTTPException(status_code=502, detail="Google OAuth retornou resposta sem access_token.")
        return token

    GEO_LOOKUP: dict[str, str] = {
        "city:são paulo": "1031714",
        "city:sao paulo": "1031714",
        "city:rio de janeiro": "1031745",
        "city:curitiba": "1031713",
        "city:belo horizonte": "1031710",
        "city:porto alegre": "1031748",
        "city:fortaleza": "1031723",
        "city:salvador": "1031755",
        "city:recife": "1031750",
        "city:manaus": "1031731",
        "city:brasilia": "1031711",
        "city:brasília": "1031711",
        "city:goiania": "1031724",
        "city:goiânia": "1031724",
        "city:belem": "1031709",
        "city:belém": "1031709",
        "city:campinas": "1031712",
        "city:são luis": "1031757",
        "city:sao luis": "1031757",
        "city:maceio": "1031729",
        "city:maceió": "1031729",
        "city:natal": "1031739",
        "city:teresina": "1031762",
        "city:campo grande": "1031715",
        "city:joao pessoa": "1031727",
        "city:joão pessoa": "1031727",
        "city:aracaju": "1031708",
        "city:florianopolis": "1031722",
        "city:florianópolis": "1031722",
        "city:vitoria": "1031764",
        "city:vitória": "1031764",
        "state:sp": "21171",
        "state:rj": "21175",
        "state:mg": "21174",
        "state:rs": "21176",
        "state:pr": "21173",
        "state:ba": "21159",
        "state:ce": "21163",
        "state:pe": "21172",
        "state:go": "21166",
        "state:df": "21164",
        "state:sc": "21177",
        "state:es": "21165",
        "state:pa": "21170",
        "state:ma": "21168",
        "state:al": "21157",
        "state:pi": "21169",
        "state:se": "21178",
        "state:pb": "21169",
        "state:mt": "21167",
        "state:ms": "21167",
        "state:ro": "21176",
        "state:am": "21158",
        "state:ap": "21158",
        "state:to": "21179",
        "state:rr": "21176",
        "state:ac": "21157",
        "state:rn": "21167",
        "country:br": "21167",
        "country:us": "2840",
        "country:pt": "2620",
        "country:mx": "2484",
        "country:ar": "2032",
        "country:co": "2170",
        "country:cl": "2152",
    }

    TARGET_TYPES_BY_GEO: dict[str, set[str]] = {
        "city": {"City", "Municipality"},
        "state": {"State", "Province", "Region"},
        "country": {"Country"},
    }

    def _location_ids_for_country(self, country: str) -> list[str]:
        configured = [value.strip() for value in settings.google_ads_default_location_ids.split(",") if value.strip()]
        if configured:
            return configured

        country_map = {
            "BR": "21167",
            "US": "2840",
            "PT": "2620",
            "MX": "2484",
        }
        fallback = country_map.get(country.upper())
        return [fallback] if fallback else ["21167"]

    def _location_ids_for_locations(
        self,
        locations: list[str],
        country: str,
        access_token: str | None = None,
    ) -> list[str]:
        if not locations:
            return self._location_ids_for_country(country)
        token = access_token if access_token else self._get_access_token()
        ids: list[str] = []
        for loc in locations:
            key = loc.strip().lower()
            suffix_match = re.search(r"#(\d+)$", key)
            if suffix_match:
                ids.append(suffix_match.group(1))
                continue
            if key.startswith("geo:"):
                maybe_id = key.split(":", 1)[1].strip()
                if maybe_id.isdigit():
                    ids.append(maybe_id)
                    continue
            if key.isdigit():
                ids.append(key)
                continue
            loc_id = self.GEO_LOOKUP.get(key)
            if loc_id:
                ids.append(loc_id)
            else:
                geo_kind, _, raw_value = key.partition(":")
                if not raw_value:
                    raw_value = key
                raw_value = raw_value.split("#")[0].strip()
                if not raw_value:
                    continue
                try:
                    dynamic = self.suggest_locations(
                        query=raw_value,
                        country=country,
                        geo_type=geo_kind if geo_kind in {"city", "state", "country"} else "city",
                        limit=1,
                        access_token=token,
                    )
                    if dynamic:
                        ids.append(dynamic[0]["id"])
                        continue
                except HTTPException:
                    logger.warning("Nao foi possivel resolver geotarget dinamico para: %s", loc)
                logger.warning("Geo location nao encontrado no lookup: %s", loc)
        return ids if ids else self._location_ids_for_country(country)

    def _normalize_target_type(self, value: str) -> str:
        lowered = value.strip().lower()
        if lowered == "city":
            return "city"
        if lowered == "state":
            return "state"
        return "country"

    def suggest_locations(
        self,
        query: str,
        country: str,
        geo_type: str,
        limit: int = 12,
        access_token: str | None = None,
    ) -> list[dict[str, str]]:
        self._ensure_configured()
        token = access_token if access_token else self._get_access_token()
        endpoint = f"https://googleads.googleapis.com/{settings.google_ads_api_version}/geoTargetConstants:suggest"
        body = {
            "locale": "pt-BR",
            "countryCode": country.upper(),
            "locationNames": {"names": [query]},
        }
        response = requests.post(
            endpoint,
            headers=self._make_headers(token),
            json=body,
            timeout=settings.request_timeout_seconds,
        )
        if response.status_code >= 400:
            logger.error(
                "Google Ads geo suggest erro: status=%s body=%s",
                response.status_code,
                response.text,
            )
            raise HTTPException(status_code=502, detail="Falha ao buscar localizacoes no Google Ads.")

        data = response.json()
        target_key = self._normalize_target_type(geo_type)
        allowed_types = self.TARGET_TYPES_BY_GEO[target_key]
        suggestions = data.get("geoTargetConstantSuggestions", []) or []
        results: list[dict[str, str]] = []
        seen: set[str] = set()

        for suggestion in suggestions:
            target = suggestion.get("geoTargetConstant", {}) or {}
            target_id = str(target.get("id", "")).strip()
            name = str(target.get("name", "")).strip()
            country_code = str(target.get("countryCode", "")).strip().upper()
            target_type = str(target.get("targetType", "")).strip()
            status = str(target.get("status", "")).strip().upper()
            if not target_id or not name or not target_type:
                continue
            if status == "REMOVAL_PLANNED":
                continue
            if target_type not in allowed_types:
                continue
            dedup_key = f"{target_id}:{name.lower()}"
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            results.append(
                {
                    "id": target_id,
                    "name": name,
                    "country_code": country_code,
                    "target_type": target_type,
                }
            )
            if len(results) >= limit:
                break
        return results

    def _make_headers(self, access_token: str) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "developer-token": settings.google_ads_developer_token,
            "Content-Type": "application/json",
        }
        if settings.google_ads_login_customer_id.strip():
            headers["login-customer-id"] = settings.google_ads_login_customer_id.replace("-", "").strip()
        return headers

    def _month_label(self, month_enum: str, year: int) -> str:
        month_map = {
            "JANUARY": "Janeiro",
            "FEBRUARY": "Fevereiro",
            "MARCH": "Março",
            "APRIL": "Abril",
            "MAY": "Maio",
            "JUNHO": "Junho",
            "JUNE": "Junho",
            "JULY": "Julho",
            "AUGUST": "Agosto",
            "SEPTEMBER": "Setembro",
            "OCTOBER": "Outubro",
            "NOVEMBER": "Novembro",
            "DECEMBER": "Dezembro",
        }
        month_name = month_map.get(month_enum.upper(), month_enum.title())
        return f"Searches: {month_name} {year}"

    def _to_int(self, value: Any) -> int | None:
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned.isdigit():
                try:
                    return int(cleaned)
                except ValueError:
                    return None
        return None

    def _pt_competition(self, competition: str | None) -> str:
        if not competition:
            return "Desconhecido"
        mapping = {
            "LOW": "Baixo",
            "MEDIUM": "Médio",
            "HIGH": "Alto",
            "UNSPECIFIED": "Desconhecido",
            "UNKNOWN": "Desconhecido",
        }
        return mapping.get(competition.upper(), competition.title())

    def _pct_text(self, current: int | None, previous: int | None) -> str | None:
        if current is None or previous is None:
            return None
        if previous == 0:
            return "0%"
        pct = ((current - previous) / previous) * 100
        return f"{pct:+.0f}%"

    def _extract_monthly_searches(self, metrics: dict[str, Any]) -> dict[str, int]:
        volumes = metrics.get("monthlySearchVolumes", []) or []
        parsed: list[tuple[datetime, str, int]] = []
        for vol in volumes:
            year = self._to_int(vol.get("year"))
            month = vol.get("month")
            searches = self._to_int(vol.get("monthlySearches"))
            if not isinstance(year, int) or searches is None or not isinstance(month, str):
                continue

            month_to_num = {
                "JANUARY": 1,
                "FEBRUARY": 2,
                "MARCH": 3,
                "APRIL": 4,
                "MAY": 5,
                "JUNE": 6,
                "JULY": 7,
                "AUGUST": 8,
                "SEPTEMBER": 9,
                "OCTOBER": 10,
                "NOVEMBER": 11,
                "DECEMBER": 12,
            }
            month_num = month_to_num.get(month.upper())
            if not month_num:
                continue
            dt = datetime(year=year, month=month_num, day=1)
            parsed.append((dt, self._month_label(month, year), searches))

        parsed.sort(key=lambda item: item[0])
        if len(parsed) > 12:
            parsed = parsed[-12:]
        return normalize_monthly_searches({label: value for _, label, value in parsed})

    def _calc_changes(self, monthly: dict[str, int]) -> tuple[str | None, str | None]:
        values = list(monthly.values())
        if not values:
            return None, None

        current = values[-1]
        three_months_before = values[-4] if len(values) >= 4 else None
        yoy = values[-12] if len(values) >= 12 else None

        return self._pct_text(current, three_months_before), self._pct_text(current, yoy)

    def _google_item_to_interest(self, item: dict[str, Any], index: int) -> InterestItem:
        text = item.get("text", "")
        metrics = item.get("keywordIdeaMetrics", {}) or {}
        avg_monthly = self._to_int(metrics.get("avgMonthlySearches"))
        competition = metrics.get("competition")
        competition_index = self._to_int(metrics.get("competitionIndex"))
        low_bid = self._to_int(metrics.get("lowTopOfPageBidMicros"))
        high_bid = self._to_int(metrics.get("highTopOfPageBidMicros"))
        close_variants = item.get("closeVariants", []) or []
        monthly_searches = self._extract_monthly_searches(metrics)
        change_3m, change_yoy = self._calc_changes(monthly_searches)

        path: list[str] = []
        if competition:
            path.append(f"Concorrência: {self._pt_competition(competition)}")
        if isinstance(competition_index, int):
            path.append(f"CompetitionIndex: {competition_index}")
        if close_variants:
            path.extend([f"Variant: {variant}" for variant in close_variants[:3]])

        return InterestItem(
            id=f"google_kw_{index}_{text[:40]}",
            name=text,
            audience_size=avg_monthly,
            type=self._pt_competition(competition),
            path=path,
            media_pesquisas=float(avg_monthly) if avg_monthly is not None else None,
            mudanca_tres_meses=change_3m,
            mudanca_ano_anterior=change_yoy,
            concorrencia=self._pt_competition(competition),
            grau_concorrencia=competition_index,
            menor_lance_topo=(low_bid / 1_000_000) if low_bid is not None else None,
            maior_lance_topo=(high_bid / 1_000_000) if high_bid is not None else None,
            searches_mensais=monthly_searches,
        )

    def _call_batch(
        self,
        batch: list[str],
        access_token: str,
        location_ids: list[str],
        limit: int,
        index_offset: int = 0,
    ) -> tuple[list[InterestItem], list[str]]:
        items: list[InterestItem] = []
        close_variants: list[str] = []
        page_token: str | None = None
        remaining = max(limit, 1)

        while remaining > 0:
            page_size = min(remaining, 10_000)
            body: dict[str, object] = {
                "language": f"languageConstants/{settings.google_ads_default_language_id}",
                "geoTargetConstants": [f"geoTargetConstants/{loc_id}" for loc_id in location_ids],
                "keywordSeed": {"keywords": batch},
                "includeAdultKeywords": settings.google_ads_include_adult_keywords,
                "keywordPlanNetwork": "GOOGLE_SEARCH_AND_PARTNERS",
                "pageSize": page_size,
            }
            if page_token:
                body["pageToken"] = page_token

            response = requests.post(
                self.keyword_ideas_url,
                headers=self._make_headers(access_token),
                json=body,
                timeout=settings.request_timeout_seconds,
            )
            if response.status_code >= 400:
                logger.error("Google Ads batch erro: status=%s body=%s", response.status_code, response.text)
                raise HTTPException(
                    status_code=502,
                    detail="Google Ads retornou erro ao buscar keywords. Verifique customer/login/developer token.",
                )

            payload = response.json()
            raw_items = payload.get("results", []) or []
            for item in raw_items:
                for variant in item.get("closeVariants", []) or []:
                    if isinstance(variant, str) and variant.strip():
                        close_variants.append(variant.strip())
                items.append(self._google_item_to_interest(item, index_offset + len(items)))

            remaining -= len(raw_items)
            page_token = payload.get("nextPageToken")
            if not page_token or not raw_items:
                break

        return items, close_variants

    def search_keywords_with_variants(
        self,
        keywords: list[str],
        country: str,
        limit: int,
        locations: list[str] | None = None,
    ) -> tuple[list[InterestItem], list[str]]:
        self._ensure_configured()
        if not self.keyword_ideas_url:
            raise HTTPException(status_code=500, detail="GOOGLE_ADS_CUSTOMER_ID invalido.")

        seed_keywords = [kw.strip() for kw in keywords if kw and kw.strip()]
        if not seed_keywords:
            return [], []

        access_token = self._get_access_token()
        location_ids = self._location_ids_for_locations(locations or [], country, access_token=access_token)

        batch_size = 10
        all_items: list[InterestItem] = []
        all_variants: list[str] = []
        for i in range(0, len(seed_keywords), batch_size):
            batch = seed_keywords[i : i + batch_size]
            batch_items, batch_variants = self._call_batch(
                batch,
                access_token,
                location_ids,
                limit,
                index_offset=i,
            )
            all_items.extend(batch_items)
            all_variants.extend(batch_variants)

        seen_names: set[str] = set()
        deduplicated: list[InterestItem] = []
        for item in all_items:
            key = item.name.lower()
            if key not in seen_names:
                seen_names.add(key)
                deduplicated.append(item)

        if settings.relevance_filter_enabled:
            before_count = len(deduplicated)
            filtered_map: dict[str, InterestItem] = {}
            for keyword in seed_keywords:
                for item in self.relevance_agent.filter_related(keyword, deduplicated):
                    filtered_map[item.id] = item
            deduplicated = list(filtered_map.values())
            logger.info(
                "Filtro de relevancia (Google) aplicado: %s -> %s resultados (threshold=%s).",
                before_count,
                len(deduplicated),
                settings.relevance_threshold,
            )

        return deduplicated[:limit], all_variants

    def search_keywords(
        self,
        keywords: list[str],
        country: str,
        limit: int,
        locations: list[str] | None = None,
    ) -> list[InterestItem]:
        items, _ = self.search_keywords_with_variants(
            keywords=keywords,
            country=country,
            limit=limit,
            locations=locations,
        )
        return items
