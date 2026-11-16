

from __future__ import annotations

import os
from typing import Any

import httpx

IMAGE_BASE = "https://image.tmdb.org/t/p"


class TMDBError(RuntimeError):
    """Erro já traduzido para o vocabulário da nossa API."""

    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


def image_url(path: str | None, size: str) -> str | None:
    return f"{IMAGE_BASE}/{size}{path}" if path else None


class TMDBClient:
    def __init__(
        self,
        api_key: str | None = None,
        token: str | None = None,
        language: str = "pt-BR",
        base_url: str = "https://api.themoviedb.org/3",
    ) -> None:
        self._api_key = (api_key or "").strip()
        self._token = (token or "").strip()
        self.language = language or "pt-BR"
        self._base_url = base_url
        self._http: httpx.AsyncClient | None = None

    @classmethod
    def from_env(cls) -> "TMDBClient":
        return cls(
            api_key=os.getenv("TMDB_API_KEY"),
            token=os.getenv("TMDB_ACCESS_TOKEN"),
            language=os.getenv("TMDB_LANGUAGE", "pt-BR"),
        )

    @property
    def configured(self) -> bool:
        return bool(self._api_key or self._token)

    def _headers(self) -> dict[str, str]:
        headers = {"accept": "application/json"}
        # A v4 do TMDB usa Bearer token; a v3 usa api_key na query.
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return headers

    async def close(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    async def get(self, path: str, **params: Any) -> dict[str, Any]:
        if not self.configured:
            raise TMDBError("TMDB não configurado: defina TMDB_API_KEY no .env", 503)

        if self._http is None:
            # Um client só, reaproveitado: mantém o pool de conexões vivo.
            self._http = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=httpx.Timeout(12.0),
                headers=self._headers(),
            )

        params.setdefault("language", self.language)
        if self._api_key and not self._token:
            params["api_key"] = self._api_key

        try:
            response = await self._http.get(path, params=params)
        except httpx.HTTPError as exc:
            raise TMDBError(f"Falha de rede ao falar com o TMDB: {exc}") from exc

        if response.status_code == 401:
            raise TMDBError("Credencial do TMDB inválida (401). Confira TMDB_API_KEY.", 502)
        if response.status_code == 404:
            raise TMDBError("Título não encontrado no TMDB.", 404)
        if response.status_code == 429:
            raise TMDBError("Limite de requisições do TMDB atingido. Tente em instantes.", 429)
        if response.status_code >= 400:
            raise TMDBError(f"O TMDB respondeu {response.status_code}.", 502)

        return response.json()


# --------------------------------------------------------------------------
# Normalização
# --------------------------------------------------------------------------


def _year(raw: dict[str, Any]) -> int | None:
    date = raw.get("release_date") or raw.get("first_air_date") or ""
    head = date[:4]
    return int(head) if head.isdigit() else None


def _trailer(raw: dict[str, Any]) -> str | None:
    for video in (raw.get("videos") or {}).get("results", []):
        if video.get("site") == "YouTube" and video.get("type") in {"Trailer", "Teaser"}:
            return f"https://www.youtube.com/watch?v={video['key']}"
    return None


def movie_card(raw: dict[str, Any]) -> dict[str, Any]:
    """Formato enxuto usado na grade, na busca e nos chips de gênero."""
    return {
        "id": raw.get("id"),
        "title": raw.get("title") or raw.get("name") or "Sem título",
        "original_title": raw.get("original_title") or raw.get("title") or "",
        "year": _year(raw),
        "overview": raw.get("overview") or "",
        "poster": image_url(raw.get("poster_path"), "w500"),
        "backdrop": image_url(raw.get("backdrop_path"), "w1280"),
        "rating": round(float(raw.get("vote_average") or 0), 1),
        "votes": raw.get("vote_count") or 0,
        "media_type": raw.get("media_type") or "movie",
    }


def movie_detail(raw: dict[str, Any]) -> dict[str, Any]:
    """Formato completo da ficha técnica."""
    card = movie_card(raw)
    credits = raw.get("credits") or {}
    crew = credits.get("crew") or []
    cast = credits.get("cast") or []

    card.update(
        {
            "tagline": raw.get("tagline") or "",
            "runtime": raw.get("runtime") or None,
            "release_date": raw.get("release_date") or None,
            "genres": [g["name"] for g in raw.get("genres") or [] if g.get("name")],
            "director": next(
                (p["name"] for p in crew if p.get("job") == "Director"),
                None,
            ),
            "cast": [p["name"] for p in cast[:6] if p.get("name")],
            "trailer": _trailer(raw),
            "homepage": raw.get("homepage") or None,
        }
    )
    return card


def normalize_list(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "page": raw.get("page", 1),
        "results": [movie_card(item) for item in raw.get("results", [])],
        "total_pages": min(raw.get("total_pages") or 1, 500),
        "total_results": raw.get("total_results") or 0,
        "source": "tmdb",
    }
