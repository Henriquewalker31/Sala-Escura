# Sala Escura

Catálogo de filmes full stack: **Python (FastAPI)** no backend, **JavaScript puro** no frontend
e a **API do TMDB** como fonte de dados.

Busca por título, destaques da semana, filtro por gênero e ficha técnica com sinopse,
direção, elenco, duração e trailer.

```
        navegador                     servidor                        externo
┌────────────────────┐      ┌──────────────────────────┐      ┌──────────────────┐
│ index.html         │      │ FastAPI                  │      │ TMDB             │
│ styles.css         │ ───► │  /api/trending           │ ───► │ api.themoviedb   │
│ app.js (ES modules)│ ◄─── │  /api/search             │ ◄─── │ (chave só aqui)  │
│                    │ JSON │  /api/discover           │      └──────────────────┘
│ sem build, sem npm │      │  /api/movies/{id}        │
└────────────────────┘      │  cache TTL + normalização│
                            └──────────────────────────┘
```

## Por que um backend no meio?

O navegador **não** fala com o TMDB diretamente. Isso parece um passo extra, mas resolve
quatro problemas de uma vez:

| Problema | Como o backend resolve |
|---|---|
| Chave da API exposta no JavaScript | Fica só no `.env`, no servidor |
| Respostas grandes e instáveis do TMDB | Saem normalizadas (`title`, `year`, `poster`, `rating`…) |
| Limite de requisições | Cache em memória com TTL de 10 min |
| Trocar de fonte de dados | Só muda `backend/app/tmdb.py` |

## Rodando

Pré-requisitos: Python 3.10+ (nada de Node, npm ou build).

```bash
cp .env.example .env      # cole sua chave do TMDB (opcional: sem ela roda em modo demo)
./run.sh                  # cria a venv, instala as dependências e sobe em :8000
```

Abra <http://localhost:8000>. A interface e a API vêm do mesmo servidor.

### Como pegar a chave do TMDB

1. Crie uma conta em <https://www.themoviedb.org/signup>.
2. Vá em **Configurações → API** e solicite uma chave (uso pessoal sai na hora).
3. Copie a **Chave da API (v3)** para `TMDB_API_KEY` no `.env` — ou, se preferir a
   v4, cole o **token de leitura** em `TMDB_ACCESS_TOKEN`.

Enquanto não houver chave, a aplicação sobe em **modo demo**: responde com o
catálogo de exemplo em `frontend/demo-data.json` (14 filmes). O selo "modo demo"
no topo indica isso.

## Endpoints

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/health` | Modo atual (`tmdb` / `demo`), idioma e itens em cache |
| GET | `/api/trending?window=week&page=1` | Filmes em alta (dia ou semana) |
| GET | `/api/search?q=bacurau&page=1` | Busca por título |
| GET | `/api/discover?genre_id=18&page=1` | Populares de um gênero |
| GET | `/api/movies/{id}` | Ficha completa + elenco + trailer |
| GET | `/docs` | Documentação interativa gerada pelo FastAPI |

Todos devolvem o mesmo formato de cartão:

```json
{
  "id": 598,
  "title": "Cidade de Deus",
  "year": 2002,
  "overview": "…",
  "poster": "https://image.tmdb.org/t/p/w500/…",
  "rating": 8.4,
  "votes": 7400,
  "media_type": "movie"
}
```

A ficha (`/api/movies/{id}`) acrescenta `tagline`, `runtime`, `genres`, `director`,
`cast` e `trailer`.

## Estrutura

```
tmdb-cine/
├── run.sh                  # um comando para subir tudo
├── .env.example
├── backend/
│   ├── app/
│   │   ├── main.py         # rotas FastAPI, CORS, montagem do frontend
│   │   ├── tmdb.py         # cliente HTTP + normalização das respostas
│   │   ├── cache.py        # cache em memória com TTL
│   │   └── demo.py         # catálogo local para rodar sem chave
│   ├── tests/test_api.py   # 7 testes de contrato (sem rede)
│   ├── pytest.ini
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── styles.css
    ├── app.js              # busca com debounce, filtros, ficha em <dialog>
    └── demo-data.json      # mesma amostra usada pelo backend e pelo fallback
```

## Testes

```bash
cd backend && python -m pytest -q
```

Os testes forçam o modo demo (limpam as variáveis de ambiente), então rodam offline
e sem gastar requisições: formato dos cartões, busca sem acento, ficha com direção e
gêneros, 404 e 422.

## Decisões que valem explicar

- **`<dialog>` nativo** para a ficha: foco preso, `Esc` para fechar e backdrop de graça.
- **JavaScript puro com módulos ES**: zero instalação. Quando o projeto crescer,
  o `app.js` migra para React/Vite sem tocar no backend.
- **Sem pôster = arte própria**: quando o filme não tem imagem, o cartão gera uma
  arte tipográfica com cor derivada do `id`. Nada de imagem quebrada.
- **Busca com debounce de 350 ms** e mínimo de 2 caracteres.
- **Acessibilidade**: navegação por teclado na grade (`Enter`/`Espaço`), `aria-live`
  na contagem de resultados, foco visível e `prefers-reduced-motion` respeitado.
- **Cache sem lock**: entre a leitura e a escrita do dicionário não existe `await`,
  então não há corrida dentro de um único event loop.

## Próximos passos (se quiser evoluir)

1. **Favoritos com login** — SQLite + `passlib` + JWT, uma tabela `favorites(user_id, movie_id)`.
2. **Postgres + SQLAlchemy** no lugar do cache em memória, guardando fichas visitadas.
3. **React/Vite** consumindo os mesmos endpoints (a API não muda).
4. **Deploy** — `Dockerfile` com `uvicorn --host 0.0.0.0` e a chave como secret do ambiente.
5. **Séries e pessoas** — a API do TMDB cobre `/tv` e `/person`; basta repetir o padrão.

## Créditos

Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.
Os dados de `frontend/demo-data.json` são uma amostra aproximada, escrita para o
projeto funcionar offline.
