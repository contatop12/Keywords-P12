import logging
from datetime import datetime
from typing import Any

import requests
from fastapi import HTTPException

from backend.core.config import settings
from backend.schemas.meta import InterestItem
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
        return {label: value for _, label, value in parsed}

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

    def search_keywords(self, keywords: list[str], country: str, limit: int) -> list[InterestItem]:
        self._ensure_configured()
        if not self.keyword_ideas_url:
            raise HTTPException(status_code=500, detail="GOOGLE_ADS_CUSTOMER_ID invalido.")
        if not keywords:
            return []

        access_token = self._get_access_token()
        location_ids = self._location_ids_for_country(country)
        seed_keywords = [keyword.strip() for keyword in keywords if keyword and keyword.strip()][:10]
        if not seed_keywords:
            return []

        body = {
            "language": f"languageConstants/{settings.google_ads_default_language_id}",
            "geoTargetConstants": [f"geoTargetConstants/{loc_id}" for loc_id in location_ids],
            "keywordSeed": {"keywords": seed_keywords},
            "includeAdultKeywords": settings.google_ads_include_adult_keywords,
            "keywordPlanNetwork": "GOOGLE_SEARCH_AND_PARTNERS",
            "pageSize": min(limit, 100),
        }

        response = requests.post(
            self.keyword_ideas_url,
            headers=self._make_headers(access_token),
            json=body,
            timeout=settings.request_timeout_seconds,
        )
        if response.status_code >= 400:
            logger.error("Google Ads keyword ideas erro: status=%s body=%s", response.status_code, response.text)
            raise HTTPException(
                status_code=502,
                detail="Google Ads retornou erro ao buscar keywords. Verifique customer/login/developer token.",
            )

        payload = response.json()
        raw_items = payload.get("results", [])
        normalized = [self._google_item_to_interest(item, idx) for idx, item in enumerate(raw_items)]

        if settings.relevance_filter_enabled:
            before_count = len(normalized)
            filtered_map: dict[str, InterestItem] = {}
            for keyword in seed_keywords:
                for item in self.relevance_agent.filter_related(keyword, normalized):
                    filtered_map[item.id] = item
            normalized = list(filtered_map.values())
            logger.info(
                "Filtro de relevancia (Google) aplicado: %s -> %s resultados (threshold=%s).",
                before_count,
                len(normalized),
                settings.relevance_threshold,
            )

        return normalized
