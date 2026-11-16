
from __future__ import annotations

import json
import unicodedata
from pathlib import Path
from typing import Any

PER_PAGE = 12


def _fold(text: str) -> str:
    """Minúsculas e sem acento, para busca tolerante ("bacurau" = "Bacuraú")."""
    decomposed = unicodedata.normalize("NFD", text.casefold())
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


class DemoCatalog:
    def __init__(self, items: list[dict[str, Any]], genres: list[dict[str, Any]]) -> None:
        self.items = items
        self.genres = genres

    @classmethod
    def empty(cls) -> "DemoCatalog":
        return cls([], [])

    @classmethod
    def load(cls, path: Path) -> "DemoCatalog":
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return cls.empty()
        return cls(data.get("results", []), data.get("genres", []))

    def _page(self, items: list[dict[str, Any]], page: int) -> dict[str, Any]:
        start = (page - 1) * PER_PAGE
        return {
            "page": page,
            "results": items[start : start + PER_PAGE],
            "total_pages": max(1, -(-len(items) // PER_PAGE)),
            "total_results": len(items),
            "source": "demo",
        }

    def trending(self, page: int = 1, window: str = "week") -> dict[str, Any]:
        return self._page(self.items, page)

    def search(self, term: str, page: int = 1) -> dict[str, Any]:
        needle = _fold(term)
        hits = [
            m
            for m in self.items
            if needle in _fold(f"{m['title']} {m.get('original_title', '')}")
        ]
        return self._page(hits, page)

    def discover(self, genre_id: int, page: int = 1) -> dict[str, Any]:
        hits = [m for m in self.items if genre_id in m.get("genre_ids", [])]
        return self._page(hits, page)

    def movie(self, movie_id: int) -> dict[str, Any] | None:
        return next((m for m in self.items if m.get("id") == movie_id), None)
