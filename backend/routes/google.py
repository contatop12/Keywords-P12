from fastapi import APIRouter, HTTPException

from backend.schemas.meta import (
    GoogleDiscoveryResponse,
    GoogleGeoSuggestionRequest,
    GoogleGeoSuggestionResponse,
    GoogleSearchRequest,
)
from backend.services.discovery_service import run_discovery
from backend.services.google_service import GoogleKeywordService

router = APIRouter(prefix="/api/google", tags=["google"])
service = GoogleKeywordService()


@router.post("/search", response_model=GoogleDiscoveryResponse)
def search_google_keywords(payload: GoogleSearchRequest) -> GoogleDiscoveryResponse:
    keywords = payload.effective_keywords
    if not keywords:
        return GoogleDiscoveryResponse(
            id="",
            created_at="",
            country=payload.country,
            results=[],
        )
    if not payload.locations:
        raise HTTPException(status_code=422, detail="Selecione ao menos uma localizacao.")

    payload_data = run_discovery(
        keywords=keywords,
        locations=payload.locations,
        country=payload.country,
        limit=payload.limit,
    )
    return GoogleDiscoveryResponse(**payload_data)


@router.post("/geo/suggest", response_model=GoogleGeoSuggestionResponse)
def suggest_google_locations(payload: GoogleGeoSuggestionRequest) -> GoogleGeoSuggestionResponse:
    results = service.suggest_locations(
        query=payload.query,
        country=payload.country,
        geo_type=payload.geo_type,
        limit=payload.limit,
    )
    return GoogleGeoSuggestionResponse(results=results)
