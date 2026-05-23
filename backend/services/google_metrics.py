from datetime import datetime

GOOGLE_YOY_LABEL = "Mudança em relação ao mesmo mês do ano anterior"

_PT_MONTH_NAMES = {
    1: "Janeiro",
    2: "Fevereiro",
    3: "Março",
    4: "Abril",
    5: "Maio",
    6: "Junho",
    7: "Julho",
    8: "Agosto",
    9: "Setembro",
    10: "Outubro",
    11: "Novembro",
    12: "Dezembro",
}

GOOGLE_STATIC_HEADERS = [
    "Palavra-Chave",
    "Média de Pesquisas",
    "Mudança em três meses",
    GOOGLE_YOY_LABEL,
    "Concorrência",
    "Grau de concorrência",
    "Menores valores para aparecer no topo da pesquisa",
    "Maiores valores para aparecer no topo da pesquisa",
]


def _build_month_columns() -> list[str]:
    now = datetime.now()
    cols: list[str] = []
    for offset in range(11, -1, -1):
        m = now.month - offset
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        cols.append(f"Searches: {_PT_MONTH_NAMES[m]} {y}")
    return cols


GOOGLE_MONTH_COLUMNS: list[str] = _build_month_columns()


def normalize_monthly_searches(raw: dict[str, int] | None) -> dict[str, int]:
    return dict(raw) if raw else {}
