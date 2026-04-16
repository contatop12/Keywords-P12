from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Meta Interest Search API"
    app_env: str = "development"
    app_debug: bool = True

    access_token: str = Field(
        default="",
        validation_alias=AliasChoices("ACCESS_TOKEN", "META_ACCESS_TOKEN"),
    )
    meta_api_version: str = "v19.0"
    meta_locale: str = "pt_BR"
    meta_ad_account_id: str = Field(
        default="",
        validation_alias=AliasChoices("META_AD_ACCOUNT_ID", "AD_ACCOUNT_ID", "META_ACCOUNT_ID"),
    )
    request_timeout_seconds: int = 20
    relevance_filter_enabled: bool = True
    relevance_threshold: float = 0.32
    google_ads_client_id: str = ""
    google_ads_client_secret: str = ""
    google_ads_refresh_token: str = ""
    google_ads_redirect_uri: str = "http://localhost:8080/callback"
    google_ads_api_version: str = "v20"
    google_ads_developer_token: str = ""
    google_ads_customer_id: str = ""
    google_ads_login_customer_id: str = ""
    google_ads_default_language_id: str = "1000"
    google_ads_default_location_ids: str = "21167"
    google_ads_include_adult_keywords: bool = False

    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001"
    )

    model_config = SettingsConfigDict(
        env_file=(".env", "..\\.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
