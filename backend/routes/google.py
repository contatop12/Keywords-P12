from fastapi import APIRouter

from backend.schemas.meta import GoogleSearchRequest, SearchResponse
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
    )
    return SearchResponse(results=results)
