import io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

_HEADER_BG = "1C1917"
_HEADER_FONT = "FAFAF9"
_ROW_ALT_BG = "FDF8F0"
_ACCENT = "D97706"

_TAB_COLORS = [
    "D97706", "B45309", "92400E", "78350F",
    "A16207", "854D0E", "713F12", "451A03",
    "CA8A04", "EAB308", "F59E0B", "FBBF24",
]

from backend.services.google_metrics import GOOGLE_MONTH_COLUMNS, GOOGLE_STATIC_HEADERS

_COL_WIDTHS = [40, 20, 22, 46, 14, 22, 42, 42]

_THIN = Side(style="thin", color="E5E5E5")
_BORDER = Border(bottom=_THIN)


def _header_fill() -> PatternFill:
    return PatternFill("solid", fgColor=_HEADER_BG)


def _alt_fill() -> PatternFill:
    return PatternFill("solid", fgColor=_ROW_ALT_BG)


def _write_sheet(ws, items: list[dict], tab_color: str = _ACCENT) -> None:
    ws.sheet_properties.tabColor = tab_color

    all_months = list(GOOGLE_MONTH_COLUMNS)
    headers = list(GOOGLE_STATIC_HEADERS) + all_months
    col_widths = _COL_WIDTHS + [18] * len(all_months)

    header_font = Font(name="Calibri", bold=True, color=_HEADER_FONT, size=10)
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = _header_fill()
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.row_dimensions[1].height = 32

    ws.freeze_panes = "A2"

    for row_idx, item in enumerate(items, start=2):
        is_alt = row_idx % 2 == 0
        alt = _alt_fill() if is_alt else None

        monthly = item.get("searches_mensais") or {}
        row_data = [
            item.get("name", ""),
            item.get("media_pesquisas"),
            item.get("mudanca_tres_meses"),
            item.get("mudanca_ano_anterior"),
            item.get("concorrencia"),
            item.get("grau_concorrencia"),
            item.get("menor_lance_topo"),
            item.get("maior_lance_topo"),
        ] + [monthly.get(m) for m in all_months]

        for col_idx, value in enumerate(row_data, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.font = Font(name="Calibri", size=10)
            cell.border = _BORDER
            if alt:
                cell.fill = alt
            if col_idx in (2, 6):
                cell.alignment = Alignment(horizontal="right")
                cell.number_format = "#,##0"
            elif col_idx in (7, 8):
                cell.alignment = Alignment(horizontal="right")
                cell.number_format = 'R$ #,##0.00'
            elif col_idx >= 9:
                cell.alignment = Alignment(horizontal="right")
                cell.number_format = "#,##0"

    for col_idx, width in enumerate(col_widths, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width


def generate_xlsx(study: dict) -> bytes:
    wb = Workbook()

    ws_general = wb.active
    ws_general.title = "Geral"
    _write_sheet(ws_general, study.get("general", []), tab_color=_ACCENT)

    categories: dict[str, list[dict]] = study.get("categories", {})
    for idx, (cat_name, items) in enumerate(categories.items()):
        safe_name = cat_name[:31]
        ws = wb.create_sheet(title=safe_name)
        color = _TAB_COLORS[idx % len(_TAB_COLORS)]
        _write_sheet(ws, items, tab_color=color)

    ws_neg = wb.create_sheet(title="Palavras Negativas")
    ws_neg.sheet_properties.tabColor = "78350F"
    neg_header_font = Font(name="Calibri", bold=True, color=_HEADER_FONT, size=10)
    for h, header in enumerate(["Categoria", "Palavras Negativas"], start=1):
        cell = ws_neg.cell(row=1, column=h, value=header)
        cell.font = neg_header_font
        cell.fill = _header_fill()
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws_neg.row_dimensions[1].height = 28
    ws_neg.column_dimensions["A"].width = 30
    ws_neg.column_dimensions["B"].width = 80

    row = 2
    ad_groups: dict[str, dict] = study.get("ad_groups", {})
    for cat, ag in ad_groups.items():
        negativas = ag.get("palavras_negativas", [])
        if negativas:
            ws_neg.cell(row=row, column=1, value=cat).font = Font(name="Calibri", size=10, bold=True)
            ws_neg.cell(row=row, column=2, value=", ".join(negativas)).font = Font(name="Calibri", size=10)
            row += 1

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()
