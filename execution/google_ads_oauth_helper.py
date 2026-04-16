import argparse
import json
import os
import re
import urllib.parse
from pathlib import Path
from typing import Any

import requests


GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords"
DEFAULT_CLIENT_SECRET_PATH = "client_secret.json"
DEFAULT_GOOGLE_ADS_API_VERSION = "v20"


def _read_client_secret(path: str) -> dict[str, Any]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if "web" in data:
        return data["web"]
    if "installed" in data:
        return data["installed"]
    raise RuntimeError("Formato de client_secret.json invalido (esperado web/installed).")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _resolve_oauth_settings(client_secret_path: str) -> dict[str, str]:
    payload = _read_client_secret(client_secret_path)
    client_id = _env("GOOGLE_ADS_CLIENT_ID", payload.get("client_id", ""))
    client_secret = _env("GOOGLE_ADS_CLIENT_SECRET", payload.get("client_secret", ""))
    redirect_uri = _env(
        "GOOGLE_ADS_REDIRECT_URI",
        (payload.get("redirect_uris") or ["http://localhost:8080/callback"])[0],
    )
    auth_uri = payload.get("auth_uri", "https://accounts.google.com/o/oauth2/auth")
    token_uri = payload.get("token_uri", "https://oauth2.googleapis.com/token")

    if not client_id or not client_secret:
        raise RuntimeError(
            "GOOGLE_ADS_CLIENT_ID/GOOGLE_ADS_CLIENT_SECRET ausentes no .env e no client_secret.json."
        )

    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "auth_uri": auth_uri,
        "token_uri": token_uri,
    }


def build_auth_url(client_secret_path: str, state: str = "google-ads-local") -> str:
    oauth = _resolve_oauth_settings(client_secret_path)
    params = {
        "client_id": oauth["client_id"],
        "redirect_uri": oauth["redirect_uri"],
        "response_type": "code",
        "scope": GOOGLE_ADS_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f'{oauth["auth_uri"]}?{urllib.parse.urlencode(params)}'


def exchange_code_for_refresh_token(client_secret_path: str, code: str) -> dict[str, Any]:
    oauth = _resolve_oauth_settings(client_secret_path)
    response = requests.post(
        oauth["token_uri"],
        data={
            "code": code,
            "client_id": oauth["client_id"],
            "client_secret": oauth["client_secret"],
            "redirect_uri": oauth["redirect_uri"],
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Falha ao trocar code por token: {response.status_code} {response.text}")
    return response.json()


def refresh_access_token(client_secret_path: str, refresh_token: str) -> str:
    oauth = _resolve_oauth_settings(client_secret_path)
    response = requests.post(
        oauth["token_uri"],
        data={
            "client_id": oauth["client_id"],
            "client_secret": oauth["client_secret"],
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Falha ao gerar access token: {response.status_code} {response.text}")
    data = response.json()
    token = data.get("access_token")
    if not token:
        raise RuntimeError("Resposta sem access_token.")
    return token


def list_google_ads_customers(client_secret_path: str, refresh_token: str, developer_token: str) -> list[str]:
    access_token = refresh_access_token(client_secret_path, refresh_token)
    api_version = _env("GOOGLE_ADS_API_VERSION", DEFAULT_GOOGLE_ADS_API_VERSION)
    response = requests.get(
        f"https://googleads.googleapis.com/{api_version}/customers:listAccessibleCustomers",
        headers={
            "Authorization": f"Bearer {access_token}",
            "developer-token": developer_token,
        },
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Falha ao listar customers: {response.status_code} {response.text}")
    payload = response.json()
    names = payload.get("resourceNames", [])
    ids: list[str] = []
    for name in names:
        match = re.search(r"customers/(\d+)", name or "")
        if match:
            ids.append(match.group(1))
    return ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Helper OAuth para Google Ads.")
    parser.add_argument(
        "--client-secret-path",
        default=DEFAULT_CLIENT_SECRET_PATH,
        help="Caminho do client_secret.json",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("auth-url", help="Gera URL de consentimento OAuth")

    exchange = subparsers.add_parser("exchange-code", help="Troca authorization code por refresh token")
    exchange.add_argument("--code", required=True, help="Code retornado pelo Google no redirect")

    list_customers = subparsers.add_parser(
        "list-customers",
        help="Lista customer IDs acessiveis com refresh token",
    )
    list_customers.add_argument("--refresh-token", required=True, help="Refresh token do OAuth")
    list_customers.add_argument(
        "--developer-token",
        default="",
        help="Developer token (ou use GOOGLE_ADS_DEVELOPER_TOKEN no .env)",
    )

    args = parser.parse_args()

    if args.command == "auth-url":
        print(build_auth_url(args.client_secret_path))
        return

    if args.command == "exchange-code":
        payload = exchange_code_for_refresh_token(args.client_secret_path, args.code)
        refresh_token = payload.get("refresh_token", "")
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        if refresh_token:
            print("\nGOOGLE_ADS_REFRESH_TOKEN=" + refresh_token)
        else:
            print(
                "\nNenhum refresh_token retornado. Use prompt=consent e remova consentimentos antigos se necessario."
            )
        return

    if args.command == "list-customers":
        dev_token = args.developer_token.strip() or _env("GOOGLE_ADS_DEVELOPER_TOKEN")
        if not dev_token:
            raise RuntimeError("GOOGLE_ADS_DEVELOPER_TOKEN ausente.")
        customer_ids = list_google_ads_customers(
            args.client_secret_path,
            args.refresh_token,
            dev_token,
        )
        print(json.dumps({"customer_ids": customer_ids}, ensure_ascii=False, indent=2))
        return


if __name__ == "__main__":
    main()
