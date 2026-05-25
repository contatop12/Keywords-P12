import logging
import re
from datetime import datetime

import gspread
from fastapi import HTTPException
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from backend.core.config import settings

logger = logging.getLogger(__name__)

_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

_PT_MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

_INVALID_SHEET_CHARS = re.compile(r"[\\/*?:\[\]]")


def _get_credentials() -> Credentials:
    client_id = settings.google_ads_client_id
    client_secret = settings.google_ads_client_secret
    refresh_token = settings.google_ads_refresh_token

    if not all([client_id, client_secret, refresh_token]):
        raise HTTPException(
            status_code=500,
            detail="Credenciais Google ausentes. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN no .env.",
        )

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=_SCOPES,
    )
    creds.refresh(Request())
    return creds


def _safe_title(name: str) -> str:
    cleaned = _INVALID_SHEET_CHARS.sub(" ", name).strip() or "Aba"
    return cleaned[:31]


def _copy_template(drive_service, title: str) -> str:
    template_id = settings.google_sheets_template_id
    body = {"name": title}
    result = drive_service.files().copy(fileId=template_id, body=body).execute()
    return result["id"]


def _make_file_public(drive_service, file_id: str) -> None:
    try:
        drive_service.permissions().create(
            fileId=file_id,
            body={"type": "anyone", "role": "reader", "allowFileDiscovery": False},
            supportsAllDrives=True,
            fields="id",
        ).execute()
    except Exception as exc:
        message = str(exc).lower()
        if "already" in message or "duplicate" in message or "409" in message:
            return
        raise


def _public_view_url(drive_service, file_id: str) -> str:
    meta = (
        drive_service.files()
        .get(fileId=file_id, fields="webViewLink", supportsAllDrives=True)
        .execute()
    )
    return meta.get("webViewLink") or f"https://docs.google.com/spreadsheets/d/{file_id}/view?usp=sharing"


def _month_columns(month_name: str, year: int) -> list[str]:
    idx = _PT_MONTHS.index(month_name)
    sequence: list[tuple[str, int]] = []
    m_idx = idx
    y = year
    for _ in range(12):
        sequence.append((_PT_MONTHS[m_idx], y))
        m_idx -= 1
        if m_idx < 0:
            m_idx = 11
            y -= 1
    result = []
    for name, yr in reversed(sequence):
        result.append(f"Searches: {name} {yr}")
    return result


def _study_month_year(study: dict) -> tuple[str, int]:
    raw = study.get("created_at")
    dt = None
    if isinstance(raw, str):
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            dt = None
    if dt is None:
        dt = datetime.utcnow()
    return _PT_MONTHS[dt.month - 1], dt.year


def _format_location(study: dict) -> str:
    locs = study.get("default_locations") or []
    if locs:
        first = re.sub(r"^(city|state|country):", "", str(locs[0]).strip(), flags=re.IGNORECASE)
        first = first.split("#")[0].strip()
        if first:
            return first.title()
    return (study.get("country") or "").upper() or "—"


def _build_data_rows(items: list[dict], month_cols: list[str]) -> list[list]:
    rows = []
    for item in items:
        monthly = item.get("searches_mensais") or {}
        row = [
            item.get("name", ""),
            item.get("media_pesquisas"),
            item.get("mudanca_tres_meses") or "--",
            item.get("mudanca_ano_anterior") or "--",
            item.get("concorrencia") or "Desconhecido",
            item.get("grau_concorrencia"),
            item.get("menor_lance_topo"),
            item.get("maior_lance_topo"),
        ]
        for col in month_cols:
            row.append(monthly.get(col))
        rows.append(row)
    return rows


def write_study_to_sheets(study: dict) -> str:
    creds = _get_credentials()
    drive_service = build("drive", "v3", credentials=creds)
    gc = gspread.authorize(creds)

    month_name, year = _study_month_year(study)
    location_label = _format_location(study)
    title = f"Estudo Keywords — {month_name} {year} · {location_label}"

    new_id = _copy_template(drive_service, title)
    logger.info("Planilha criada via cópia do template: id=%s", new_id)

    spreadsheet = gc.open_by_key(new_id)
    month_cols = _month_columns(month_name, year)

    tabs = study.get("tabs") or []
    existing_sheets = {ws.title: ws for ws in spreadsheet.worksheets()}

    used_titles: set[str] = set()

    for idx, tab in enumerate(tabs):
        tab_name = _safe_title(tab.get("name") or "Aba")
        candidate = tab_name
        counter = 2
        while candidate in used_titles:
            candidate = f"{tab_name[:28]} ({counter})"
            counter += 1
        used_titles.add(candidate)

        seeds = tab.get("seeds") or []
        items = tab.get("items") or []

        if candidate in existing_sheets:
            ws = existing_sheets[candidate]
        elif idx == 0 and existing_sheets:
            ws = spreadsheet.sheet1
            ws.update_title(candidate)
            existing_sheets[candidate] = ws
        else:
            ws = spreadsheet.add_worksheet(
                title=candidate,
                rows=max(len(items) + 10, 50),
                cols=len(month_cols) + 8 + 2,
            )

        seeds_label = "; ".join(s for s in seeds if s)
        ws.update("A1", [[f"{month_name} de {year}", location_label, "", f"Seeds: {seeds_label}"]])

        data_rows = _build_data_rows(items, month_cols)
        if data_rows:
            start_row = 3
            end_col = gspread.utils.rowcol_to_a1(start_row + len(data_rows) - 1, len(data_rows[0]))
            ws.update(f"A{start_row}:{end_col}", data_rows)

    _make_file_public(drive_service, new_id)

    url = _public_view_url(drive_service, new_id)
    logger.info("Exportação Sheets concluída: %s", url)
    return url
