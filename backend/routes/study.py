import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from backend.services import export_service, multi_study_service, study_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/google", tags=["study"])


class StudyRequest(BaseModel):
    keywords: list[str] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    country: str = Field(default="BR")
    limit: int = Field(default=50, ge=1)

    def effective_keywords(self) -> list[str]:
        return [kw.strip() for kw in self.keywords if kw and kw.strip()]


class TabRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    seeds: list[str] = Field(default_factory=list)
    locations: list[str] | None = None
    country: str | None = None
    limit: int | None = None


class MultiStudyRequest(BaseModel):
    tabs: list[TabRequest] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    country: str = Field(default="BR")
    limit: int = Field(default=50, ge=1)


@router.post("/multi-study")
def generate_multi_study(payload: MultiStudyRequest) -> dict:
    if not payload.tabs:
        raise HTTPException(status_code=422, detail="Informe ao menos uma aba.")
    if len(payload.tabs) > 50:
        raise HTTPException(status_code=422, detail="Maximo de 50 abas por estudo.")

    tabs_payload = [tab.model_dump() for tab in payload.tabs]

    try:
        return multi_study_service.generate_multi_study(
            tabs=tabs_payload,
            default_locations=payload.locations,
            default_country=payload.country,
            default_limit=payload.limit,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Erro ao gerar estudo multi-aba")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/study")
def generate_study(payload: StudyRequest) -> dict:
    keywords = payload.effective_keywords()
    if not keywords:
        raise HTTPException(status_code=422, detail="Informe ao menos uma keyword.")
    if len(keywords) > 50:
        raise HTTPException(status_code=422, detail="Maximo de 50 keywords por estudo.")

    try:
        return study_service.generate_study(
            keywords=keywords,
            locations=payload.locations,
            country=payload.country,
            limit=payload.limit,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Erro ao gerar estudo")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _export_xlsx(study: dict) -> Response:
    try:
        xlsx_bytes = export_service.generate_xlsx(study)
    except Exception as exc:
        logger.exception("Erro ao gerar XLSX")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="estudo-keywords.xlsx"'},
    )


@router.post("/study/export")
def export_study(study: dict) -> Response:
    return _export_xlsx(study)


@router.post("/discovery/export")
def export_discovery(study: dict) -> Response:
    return _export_xlsx(study)
