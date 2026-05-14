from fastapi import APIRouter

from backend.schemas.meta import (
    GoogleGeoSuggestionRequest,
    GoogleGeoSuggestionResponse,
    GoogleSearchRequest,
    SearchResponse,
)
from backend.services.google_service import GoogleKeywordService

router = APIRouter(prefix="/api/google", tags=["google"])
service = GoogleKeywordService()


@router.post("/search", response_model=SearchResponse)
def search_google_keywords(payload: GoogleSearchRequest) -> SearchResponse:
    keywords = payload.effective_keywords
    if not keywords:
        return SearchResponse(results=[])

    results = service.search_keywords(
        keywords=keywords,
        country=payload.country,
        limit=payload.limit,
        locations=payload.locations,
    )
    return SearchResponse(results=results)


@router.post("/geo/suggest", response_model=GoogleGeoSuggestionResponse)
def suggest_google_locations(payload: GoogleGeoSuggestionRequest) -> GoogleGeoSuggestionResponse:
    results = service.suggest_locations(
        query=payload.query,
        country=payload.country,
        geo_type=payload.geo_type,
        limit=payload.limit,
    )
    return GoogleGeoSuggestionResponse(results=results)
