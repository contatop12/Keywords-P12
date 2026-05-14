from pydantic import BaseModel, Field, field_validator


class SearchRequest(BaseModel):
    keyword: str = Field(min_length=1, max_length=200)
    country: str = Field(default="BR", min_length=2, max_length=2)
    limit: int = Field(default=50, ge=1, le=100)

    @field_validator("keyword")
    @classmethod
    def validate_keyword(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("keyword nao pode ser vazia")
        return cleaned

    @field_validator("country")
    @classmethod
    def validate_country(cls, value: str) -> str:
        return value.strip().upper()


class InterestItem(BaseModel):
    id: str
    name: str
    audience_size: int | None = None
    type: str | None = None
    path: list[str] = Field(default_factory=list)
    media_pesquisas: float | None = None
    mudanca_tres_meses: str | None = None
    mudanca_ano_anterior: str | None = None
    concorrencia: str | None = None
    grau_concorrencia: int | None = None
    menor_lance_topo: float | None = None
    maior_lance_topo: float | None = None
    searches_mensais: dict[str, int] = Field(default_factory=dict)


class SearchResponse(BaseModel):
    results: list[InterestItem] = Field(default_factory=list)


class GoogleDiscoveryResponse(BaseModel):
    id: str
    created_at: str
    seed_keywords: list[str] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    country: str
    general: list[InterestItem] = Field(default_factory=list)
    categories: dict[str, list[InterestItem]] = Field(default_factory=dict)
    broaden_suggestions: list[str] = Field(default_factory=list)
    results: list[InterestItem] = Field(default_factory=list)


class GoogleSearchRequest(BaseModel):
    keyword: str = Field(default="", max_length=200)
    keywords: list[str] = Field(default_factory=list)
    country: str = Field(default="BR", min_length=2, max_length=2)
    limit: int = Field(default=50, ge=1)
    locations: list[str] = Field(default_factory=list)

    @field_validator("keyword")
    @classmethod
    def validate_keyword(cls, value: str) -> str:
        return value.strip()

    @field_validator("keywords")
    @classmethod
    def validate_keywords(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values if value and value.strip()]
        unique: list[str] = []
        seen: set[str] = set()
        for item in cleaned:
            lowered = item.lower()
            if lowered not in seen:
                seen.add(lowered)
                unique.append(item)
        if len(unique) > 50:
            raise ValueError("keywords permite no maximo 50 termos")
        return unique

    @field_validator("country")
    @classmethod
    def validate_country(cls, value: str) -> str:
        return value.strip().upper()

    @property
    def effective_keywords(self) -> list[str]:
        if self.keywords:
            return self.keywords
        if self.keyword:
            return [self.keyword]
        return []


class GoogleGeoSuggestionRequest(BaseModel):
    query: str = Field(min_length=1, max_length=120)
    country: str = Field(default="BR", min_length=2, max_length=2)
    geo_type: str = Field(default="city", pattern="^(city|state|country)$")
    limit: int = Field(default=12, ge=1, le=25)

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("query nao pode ser vazio")
        return cleaned

    @field_validator("country")
    @classmethod
    def validate_country_code(cls, value: str) -> str:
        return value.strip().upper()


class GoogleGeoSuggestionItem(BaseModel):
    id: str
    name: str
    country_code: str
    target_type: str


class GoogleGeoSuggestionResponse(BaseModel):
    results: list[GoogleGeoSuggestionItem] = Field(default_factory=list)
