"""
Gera um refresh token com escopos Google Ads + Sheets + Drive.
Execute uma vez e copie o REFRESH_TOKEN para o .env.

Usage:
    python scripts/get_refresh_token.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/adwords",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

CLIENT_SECRETS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "client_secret_253030348436-b9bflu3ql8frlcfkmq03tbdokuae6rgk.apps.googleusercontent.com.json")

def main():
    if not os.path.exists(CLIENT_SECRETS_FILE):
        print(f"Arquivo de credenciais não encontrado: {CLIENT_SECRETS_FILE}")
        print("Passe o caminho correto do arquivo client_secret_*.json baixado do Google Cloud Console.")
        sys.exit(1)

    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS_FILE, scopes=SCOPES)
    creds = flow.run_local_server(port=8080, prompt="consent", access_type="offline")

    print("\n" + "=" * 60)
    print("REFRESH_TOKEN gerado com sucesso!")
    print("=" * 60)
    print(f"\nAdicione ao .env:\n")
    print(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}")
    print(f"GOOGLE_CLIENT_ID={creds.client_id}")
    print(f"GOOGLE_CLIENT_SECRET={creds.client_secret}")
    print("\nEscopos autorizados:")
    for s in SCOPES:
        print(f"  ✓ {s}")


if __name__ == "__main__":
    main()
