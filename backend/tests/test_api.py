

import os

# Valores vazios (em vez de remover) impedem que o .env local seja carregado:
# load_dotenv não sobrescreve variáveis já definidas.
os.environ["TMDB_API_KEY"] = ""
os.environ["TMDB_ACCESS_TOKEN"] = ""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as test_client:
        yield test_client


def test_health_sobe_em_modo_demo(client):
    body = client.get("/api/health").json()
    assert body["ok"] is True
    assert body["mode"] == "demo"


def test_trending_devolve_cartoes_normalizados(client):
    response = client.get("/api/trending")
    assert response.status_code == 200

    body = response.json()
    assert body["source"] == "demo"
    assert body["results"], "o catálogo de exemplo não pode estar vazio"

    card = body["results"][0]
    for field in ("id", "title", "year", "rating", "poster"):
        assert field in card


def test_busca_ignora_acento_e_caixa(client):
    response = client.get("/api/search", params={"q": "BACURAU"})
    titles = [movie["title"] for movie in response.json()["results"]]
    assert any("Bacurau" in title for title in titles)


def test_ficha_traz_diretor_e_generos(client):
    first = client.get("/api/trending").json()["results"][0]
    body = client.get(f"/api/movies/{first['id']}").json()

    assert body["director"]
    assert body["genres"]
    assert body["runtime"]


def test_ficha_inexistente_responde_404(client):
    assert client.get("/api/movies/999999").status_code == 404


def test_busca_vazia_responde_422(client):
    assert client.get("/api/search", params={"q": ""}).status_code == 422


def test_paginacao_respeita_limite(client):
    assert client.get("/api/trending", params={"page": 99}).status_code == 422
