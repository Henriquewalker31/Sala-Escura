

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Awaitable, Callable

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .cache import TTLCache
from .demo import DemoCatalog
from .tmdb import TMDBClient, TMDBError, movie_detail, normalize_list

ROOT = Path(__file__).resolve().parents[2]
BACKEND = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
DEMO_FILE = FRONTEND / "demo-data.json"

# backend/.env tem precedência sobre o .env da raiz.
load_dotenv(BACKEND / ".env")
load_dotenv(ROOT / ".env")


def create_app() -> FastAPI:
    tmdb = TMDBClient.from_env()
    demo = DemoCatalog.load(DEMO_FILE) if DEMO_FILE.exists() else DemoCatalog.empty()
    cache = TTLCache(ttl=float(os.getenv("CACHE_TTL", "600")))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await tmdb.close()

    app = FastAPI(
        title="Sala Escura API",
        version="1.0.0",
        summary="Catálogo de filmes: BFF em FastAPI sobre a API do TMDB.",
        lifespan=lifespan,
    )
    app.state.tmdb = tmdb

    # Só GET é exposto; CORS liberado para você poder servir o frontend
    # de outra porta (Live Server, Vite) durante o desenvolvimento.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    async def cached(
        key: str,
        loader: Callable[[], Awaitable[dict[str, Any]]],
    ) -> tuple[dict[str, Any], bool]:
        return await cache.get_or_set(key, loader)

    # -- rotas ------------------------------------------------------------

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        """Diz em que modo a API está: tmdb (chave válida) ou demo."""
        return {
            "ok": True,
            "mode": "tmdb" if tmdb.configured else "demo",
            "language": tmdb.language,
            "cached_entries": cache.size,
        }

    @app.get("/api/genres")
    async def genres() -> dict[str, Any]:
        if not tmdb.configured:
            return {"genres": demo.genres, "source": "demo"}

        async def load() -> dict[str, Any]:
            raw = await tmdb.get("/genre/movie/list")
            return {"genres": [{"id": g["id"], "name": g["name"]} for g in raw.get("genres", [])]}

        payload, hit = await cached("genres", load)
        return {**payload, "source": "tmdb", "cached": hit}

    @app.get("/api/trending")
    async def trending(
        window: str = Query("week", pattern="^(day|week)$"),
        page: int = Query(1, ge=1, le=20),
    ) -> dict[str, Any]:
        """Filmes em alta agora (atualizado pelo próprio TMDB)."""
        if not tmdb.configured:
            return demo.trending(page=page, window=window)

        async def load() -> dict[str, Any]:
            raw = await tmdb.get(f"/trending/movie/{window}", page=page)
            return normalize_list(raw)

        payload, hit = await cached(f"trending:{window}:{page}", load)
        return {**payload, "cached": hit}

    @app.get("/api/search")
    async def search(
        q: str = Query(..., min_length=1, max_length=120, description="Título ou parte dele"),
        page: int = Query(1, ge=1, le=20),
    ) -> dict[str, Any]:
        term = q.strip()
        if not term:
            raise HTTPException(status_code=422, detail="Informe um termo para buscar.")

        if not tmdb.configured:
            return demo.search(term, page=page)

        async def load() -> dict[str, Any]:
            raw = await tmdb.get("/search/movie", query=term, page=page, include_adult="false")
            return normalize_list(raw)

        payload, hit = await cached(f"search:{term.casefold()}:{page}", load)
        return {**payload, "cached": hit}

    @app.get("/api/discover")
    async def discover(
        genre_id: int = Query(..., ge=1),
        page: int = Query(1, ge=1, le=20),
    ) -> dict[str, Any]:
        """Populares de um gênero específico."""
        if not tmdb.configured:
            return demo.discover(genre_id, page=page)

        async def load() -> dict[str, Any]:
            raw = await tmdb.get(
                "/discover/movie",
                with_genres=str(genre_id),
                sort_by="popularity.desc",
                page=page,
                include_adult="false",
                **{"vote_count.gte": 50},
            )
            return normalize_list(raw)

        payload, hit = await cached(f"discover:{genre_id}:{page}", load)
        return {**payload, "cached": hit}

    @app.get("/api/movies/{movie_id}")
    async def movie(movie_id: int) -> dict[str, Any]:
        """Ficha completa: sinopse, equipe, elenco, duração e trailer."""
        if not tmdb.configured:
            found = demo.movie(movie_id)
            if found is None:
                raise HTTPException(status_code=404, detail="Título não encontrado no catálogo de exemplo.")
            return found

        async def load() -> dict[str, Any]:
            raw = await tmdb.get(
                f"/movie/{movie_id}",
                append_to_response="videos,credits",
            )
            return movie_detail(raw)

        payload, hit = await cached(f"movie:{movie_id}", load)
        return {**payload, "cached": hit}

    # -- erros e arquivos estáticos ---------------------------------------

    @app.exception_handler(TMDBError)
    async def tmdb_error_handler(_: Request, exc: TMDBError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"detail": str(exc)})

    if FRONTEND.exists():
        # Montado por último: as rotas /api/* têm prioridade.
        app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")

    return app


app = create_app()
