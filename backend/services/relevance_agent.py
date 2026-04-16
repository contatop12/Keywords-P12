import re
import unicodedata
from difflib import SequenceMatcher

from backend.schemas.meta import InterestItem


class KeywordRelevanceAgent:
    """
    Agente deterministico de relevancia lexical.
    Filtra interesses com base em similaridade entre keyword e (name + path).
    """

    STOPWORDS = {
        "de",
        "da",
        "do",
        "das",
        "dos",
        "e",
        "em",
        "para",
        "por",
        "com",
        "sem",
        "a",
        "o",
        "as",
        "os",
    }

    def __init__(self, threshold: float = 0.32) -> None:
        self.threshold = threshold

    def _normalize(self, text: str) -> str:
        cleaned = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
        cleaned = cleaned.lower().strip()
        return re.sub(r"\s+", " ", cleaned)

    def _tokens(self, text: str) -> set[str]:
        normalized = self._normalize(text)
        words = re.findall(r"[a-z0-9]{2,}", normalized)
        return {word for word in words if word not in self.STOPWORDS}

    def _score(self, keyword: str, item: InterestItem) -> float:
        kw_norm = self._normalize(keyword)
        target = self._normalize(f"{item.name} {' '.join(item.path)}")

        if not kw_norm or not target:
            return 0.0

        if kw_norm in target:
            return 1.0

        kw_tokens = self._tokens(keyword)
        target_tokens = self._tokens(target)

        if not kw_tokens or not target_tokens:
            return SequenceMatcher(None, kw_norm, target).ratio()

        overlap = len(kw_tokens.intersection(target_tokens)) / len(kw_tokens)
        fuzzy = SequenceMatcher(None, kw_norm, target).ratio()

        # Score final prioriza overlap de tokens, mas preserva fuzzy match.
        return (overlap * 0.7) + (fuzzy * 0.3)

    def filter_related(self, keyword: str, items: list[InterestItem]) -> list[InterestItem]:
        ranked: list[tuple[float, InterestItem]] = []
        for item in items:
            score = self._score(keyword, item)
            if score >= self.threshold:
                ranked.append((score, item))

        ranked.sort(key=lambda pair: pair[0], reverse=True)
        return [item for _, item in ranked]
