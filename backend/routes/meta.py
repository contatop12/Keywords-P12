from fastapi import APIRouter

from backend.schemas.meta import SearchRequest, SearchResponse
from backend.services.meta_service import MetaInterestService

router = APIRouter(prefix="/api/meta", tags=["meta"])
service = MetaInterestService()


@router.post("/search", response_model=SearchResponse)
def search_meta_interests(payload: SearchRequest) -> SearchResponse:
    results = service.search_interests(
        keyword=payload.keyword,
        country=payload.country,
        limit=payload.limit,
    )
    return SearchResponse(results=results)
