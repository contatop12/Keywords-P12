import argparse
import json
import os
from typing import Any

import requests


def normalize_interest(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(raw.get("id", "")),
        "name": raw.get("name", ""),
        "audience_size": raw.get("audience_size"),
        "type": raw.get("type"),
        "path": raw.get("path", []),
    }


def run(keyword: str, country: str, limit: int) -> dict[str, list[dict[str, Any]]]:
    token = os.getenv("ACCESS_TOKEN", "").strip()
    if not token:
        token = os.getenv("META_ACCESS_TOKEN", "").strip()
    if not token:
        raise RuntimeError("ACCESS_TOKEN ou META_ACCESS_TOKEN nao encontrado no ambiente.")

    if not keyword.strip():
        raise ValueError("keyword nao pode ser vazia.")
    if limit < 1 or limit > 100:
        raise ValueError("limit deve estar entre 1 e 100.")

    version = os.getenv("META_API_VERSION", "v19.0")
    locale = os.getenv("META_LOCALE", "pt_BR")
    ad_account_id = os.getenv("META_AD_ACCOUNT_ID", "").strip() or os.getenv("AD_ACCOUNT_ID", "").strip()
    timeout_seconds = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "20"))

    params = {
        "type": "adinterest",
        "q": keyword,
        "limit": limit,
        "locale": locale,
        "country_code": country,
        "access_token": token,
    }

    if ad_account_id:
        target_url = f"https://graph.facebook.com/{version}/act_{ad_account_id}/targetingsearch"
        response = requests.get(target_url, params=params, timeout=timeout_seconds)
        if response.status_code >= 400:
            fallback_url = f"https://graph.facebook.com/{version}/search"
            response = requests.get(fallback_url, params=params, timeout=timeout_seconds)
    else:
        fallback_url = f"https://graph.facebook.com/{version}/search"
        response = requests.get(fallback_url, params=params, timeout=timeout_seconds)

    response.raise_for_status()

    payload = response.json()
    data = payload.get("data", [])

    return {"results": [normalize_interest(item) for item in data]}


def main() -> None:
    parser = argparse.ArgumentParser(description="CLI de pesquisa de interesses Meta Ads.")
    parser.add_argument("--keyword", required=True, help="Keyword para busca de interesses.")
    parser.add_argument("--country", default="BR", help="Pais da busca. Ex.: BR")
    parser.add_argument("--limit", type=int, default=50, help="Limite de resultados (1-100).")

    args = parser.parse_args()
    output = run(keyword=args.keyword, country=args.country.upper(), limit=args.limit)
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
