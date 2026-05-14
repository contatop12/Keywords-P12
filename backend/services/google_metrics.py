GOOGLE_YOY_LABEL = (
    "Mudança em relação ao mesmo mês do ano anterior (março/25 e 26)"
)

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

GOOGLE_MONTH_COLUMNS = [
    "Searches: Abril 2025",
    "Searches: Maio 2025",
    "Searches: Junho 2025",
    "Searches: Julho 2025",
    "Searches: Agosto 2025",
    "Searches: Setembro 2025",
    "Searches: Outubro 2025",
    "Searches: Novembro 2025",
    "Searches: Dezembro 2025",
    "Searches: Janeiro 2026",
    "Searches: Fevereiro 2026",
    "Searches: Março 2026",
]


def normalize_monthly_searches(raw: dict[str, int] | None) -> dict[str, int]:
    source = raw or {}
    return {label: source[label] for label in GOOGLE_MONTH_COLUMNS if label in source}
