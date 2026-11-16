/* ---------------------------------------------------------------------------
   Sala Escura — frontend em JavaScript puro (módulos ES, sem build).

   Regra do projeto: o navegador só conhece os endpoints /api/*. Toda a
   conversa com o TMDB (e a chave) fica no backend em Python.
   --------------------------------------------------------------------------- */

const API = "/api";

const S = {
  mode: "demo",              // "tmdb" | "demo" | "offline"
  view: { kind: "trending", window: "week" },
  page: 1,
  totalPages: 1,
  items: [],
};

const dom = {
  form: document.getElementById("search-form"),
  q: document.getElementById("q"),
  grid: document.getElementById("grid"),
  status: document.getElementById("status"),
  note: document.getElementById("note"),
  more: document.getElementById("more"),
  moreWrap: document.getElementById("more-wrap"),
  shelfTitle: document.getElementById("shelf-title"),
  shelfMeta: document.getElementById("shelf-meta"),
  billboard: document.getElementById("billboard"),
  chips: document.getElementById("chips"),
  mode: document.getElementById("mode"),
  modeLabel: document.getElementById("mode-label"),
  dialog: document.getElementById("ficha"),
  dialogBody: document.getElementById("ficha-body"),
  close: document.getElementById("ficha-close"),
};

const fmtInt = new Intl.NumberFormat("pt-BR");
const fmtRating = (n) => Number(n).toFixed(1).replace(".", ",");

/* --------------------------------------------------------------- utilidades */

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function hue(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.codePointAt(0)) % 360;
  // A arte de reserva fica no vocabulário da sala escura: azul ou vermelho.
  return h < 190 ? 204 + (h % 32) : 348 + (h % 12);
}

function initials(title) {
  const words = String(title).replace(/[^\p{L}\d ]/gu, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function truncate(text, max) {
  const clean = String(text || "").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/[\s,.;:—-]+\S*$/, "")}…`;
}

function readableRuntime(minutes) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
}

/* --------------------------------------------------------------------- API */

async function api(path, params = {}) {
  const url = new URL(API + path, location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(9000) : undefined,
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* resposta sem JSON: tratamos pelo status abaixo */
  }

  if (!res.ok) {
    const detail = body && typeof body.detail === "string" ? body.detail : `A API respondeu ${res.status}.`;
    throw new Error(detail);
  }
  return body;
}

/* ------------------------------------------------------------- marcação UI */

/* Face do fotograma: pôster do TMDB quando existe; senão, arte tipográfica
   gerada a partir do título (nunca uma imagem quebrada). */
function artMarkup(movie) {
  if (movie.poster) {
    return `<img src="${esc(movie.poster)}" alt="" loading="lazy" decoding="async">`;
  }
  return `<div class="face-fallback">
      <span class="face-init">${esc(initials(movie.title))}</span>
      <div class="face-foot">
        <span class="face-title">${esc(truncate(movie.title, 44))}</span>
        ${movie.rating ? `<span class="face-rating mono">${fmtRating(movie.rating)}</span>` : ""}
      </div>
    </div>`;
}

function frameMarkup(movie, index = 0) {
  const h1 = hue(movie.id ?? movie.title);
  const h2 = (h1 + 40) % 360;
  const art = artMarkup(movie);

  const meta = [movie.year ?? "—", movie.votes ? `${fmtInt.format(movie.votes)} votos` : null]
    .filter(Boolean)
    .join(" · ");

  return `
    <article class="frame" role="button" tabindex="0"
             data-id="${esc(movie.id)}"
             style="--h1:${h1};--h2:${h2};--d:${Math.min(index, 11) * 35}ms"
             aria-label="Abrir ficha de ${esc(movie.title)}">
      <div class="frame-inner">
        <span class="perf" aria-hidden="true"></span>
        <div class="face">
          ${art}
          ${movie.rating ? `<span class="badge mono">${fmtRating(movie.rating)}</span>` : ""}
        </div>
        <span class="perf" aria-hidden="true"></span>
      </div>
      <h3 class="frame-title">${esc(movie.title)}</h3>
      <p class="frame-meta mono">${esc(meta)}</p>
    </article>`;
}

function skeletonMarkup(count = 8) {
  return Array.from({ length: count }, () => `
    <div class="frame skeleton" aria-hidden="true">
      <div class="frame-inner">
        <span class="perf"></span><div class="face"></div><span class="perf"></span>
      </div>
      <div class="line"></div>
      <div class="line line--short"></div>
    </div>`).join("");
}

function renderBillboard(movie) {
  if (!movie) {
    dom.billboard.hidden = true;
    dom.billboard.innerHTML = "";
    return;
  }
  const h1 = hue(movie.id ?? movie.title);
  const h2 = (h1 + 40) % 360;

  dom.billboard.hidden = false;
  dom.billboard.innerHTML = `
    <div class="billboard-copy">
      <p class="eyebrow">${S.view.window === "day" ? "em alta hoje" : "em alta na semana"}</p>
      <h1>${esc(movie.title)}</h1>
      <p class="billboard-meta mono">
        ${esc([movie.year ?? "—", movie.rating ? `${fmtRating(movie.rating)}/10` : null,
               movie.votes ? `${fmtInt.format(movie.votes)} votos` : null].filter(Boolean).join("  ·  "))}
      </p>
      <p class="billboard-overview">${esc(truncate(movie.overview, 260))}</p>
      <div class="billboard-actions">
        <button class="btn btn--solid" type="button" data-id="${esc(movie.id)}">Ver ficha</button>
      </div>
    </div>
    <div class="frame" style="--h1:${h1};--h2:${h2}">
      <div class="frame-inner">
        <span class="perf" aria-hidden="true"></span>
        <div class="face">${artMarkup(movie)}</div>
        <span class="perf" aria-hidden="true"></span>
      </div>
    </div>`;
}

function fichaMarkup(movie) {
  const h1 = hue(movie.id ?? movie.title);
  const h2 = (h1 + 40) % 360;

  const rows = [
    movie.director ? ["Direção", movie.director] : null,
    movie.year ? ["Ano", String(movie.year)] : null,
    ["Duração", readableRuntime(movie.runtime)],
    movie.rating ? ["Nota", `${fmtRating(movie.rating)} / 10 · ${fmtInt.format(movie.votes || 0)} votos`] : null,
    movie.genres && movie.genres.length ? ["Gêneros", movie.genres.join(", ")] : null,
    movie.cast && movie.cast.length ? ["Elenco", movie.cast.join(", ")] : null,
    movie.original_title && movie.original_title !== movie.title ? ["Título original", movie.original_title] : null,
  ].filter(Boolean);

  return `
    <div class="ficha-grid">
      <div class="ficha-art">
        <div class="frame" style="--h1:${h1};--h2:${h2}">
          <div class="frame-inner">
            <span class="perf" aria-hidden="true"></span>
            <div class="face">${artMarkup(movie)}</div>
            <span class="perf" aria-hidden="true"></span>
          </div>
        </div>
      </div>

      <div class="ficha-body">
        <p class="eyebrow mono">ficha técnica</p>
        <h2 id="ficha-title">${esc(movie.title)}</h2>
        ${movie.tagline ? `<p class="tagline">${esc(movie.tagline)}</p>` : ""}
        <p class="ficha-overview">${esc(movie.overview || "Sinopse não disponível para este título.")}</p>
        <dl class="spec">
          ${rows.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join("")}
        </dl>
        ${movie.trailer ? `<div class="ficha-actions">
          <a class="btn btn--solid" href="${esc(movie.trailer)}" target="_blank" rel="noreferrer">Assistir ao trailer</a>
        </div>` : ""}
      </div>
    </div>`;
}

/* ---------------------------------------------------------------- mensagens */

function renderStatus(title, detail, isError = false) {
  dom.status.hidden = false;
  dom.status.className = `status${isError ? " status--error" : ""}`;
  dom.status.innerHTML = `<strong>${esc(title)}</strong>${esc(detail)}`;
}

function showNote(text) {
  dom.note.hidden = false;
  dom.note.textContent = text;
}

function setMode(mode) {
  S.mode = mode;
  if (mode === "tmdb") {
    dom.mode.hidden = true;
    return;
  }
  dom.mode.hidden = false;
  dom.mode.dataset.mode = mode;
  dom.modeLabel.textContent = mode === "demo" ? "modo demo" : "sem conexão";
}

/* --------------------------------------------------------------- navegação */

function syncChips() {
  for (const chip of dom.chips.querySelectorAll(".chip")) {
    const id = chip.dataset.genre;
    const active = id
      ? S.view.kind === "genre" && String(S.view.id) === id
      : S.view.kind === "trending";
    chip.setAttribute("aria-pressed", String(active));
  }
}

function renderChips(genres = []) {
  const all = [{ id: "", name: "Em alta" }, ...genres];
  dom.chips.innerHTML = all
    .map(
      (genre) => `<button class="chip" type="button" data-genre="${esc(genre.id)}"
                    data-name="${esc(genre.name)}" aria-pressed="false">${esc(genre.name)}</button>`,
    )
    .join("");
}

function reportSummary(data, shown) {
  const total = typeof data.total_results === "number" ? data.total_results : shown;
  const parts = [`${fmtInt.format(total)} ${total === 1 ? "título" : "títulos"}`];
  if (data.cached) parts.push("cache");
  if (data.source === "demo") parts.push("amostra local");
  return parts.join(" · ");
}

async function load(view, { append = false } = {}) {
  const page = append ? S.page + 1 : 1;

  let path = "/trending";
  const params = { page };
  let title = "Em alta esta semana";

  if (view.kind === "search") {
    path = "/search";
    params.q = view.q;
    title = `Busca por “${view.q}”`;
  } else if (view.kind === "genre") {
    path = "/discover";
    params.genre_id = view.id;
    title = view.name || "Gênero";
  } else {
    params.window = view.window || "week";
    title = view.window === "day" ? "Em alta hoje" : "Em alta esta semana";
  }

  if (!append) {
    S.items = [];
    dom.grid.setAttribute("aria-busy", "true");
    dom.grid.innerHTML = skeletonMarkup(8);
    dom.status.hidden = true;
    dom.moreWrap.hidden = true;
    dom.billboard.hidden = true;
  }

  try {
    const data = await api(path, params);
    const results = data.results || [];

    S.view = view;
    S.page = page;
    S.totalPages = data.total_pages || 1;
    S.items = append ? [...S.items, ...results] : results;

    dom.grid.setAttribute("aria-busy", "false");
    dom.shelfTitle.textContent = title;
    dom.shelfMeta.textContent = reportSummary(data, results.length);

    if (!results.length) {
      dom.grid.innerHTML = "";
      renderStatus(
        "Nenhum título encontrado",
        view.kind === "search"
          ? "Tente outra grafia ou busque pelo título original."
          : "Escolha outro gênero ou volte para os destaques.",
      );
    } else {
      dom.grid.innerHTML = S.items.map(frameMarkup).join("");
    }

    if (view.kind === "trending" && S.items.length) renderBillboard(S.items[0]);
    else {
      dom.billboard.hidden = true;
      dom.billboard.innerHTML = "";
    }

    dom.moreWrap.hidden = S.page >= S.totalPages || !results.length;
    syncChips();

    if (data.source === "demo" && view.kind === "trending") {
      showNote(
        "Sem chave do TMDB configurada: mostrando a amostra local que vem com o projeto. " +
          "Preencha TMDB_API_KEY no .env e reinicie para ver o catálogo completo.",
      );
    }
  } catch (err) {
    dom.grid.setAttribute("aria-busy", "false");
    dom.grid.innerHTML = "";
    dom.moreWrap.hidden = true;
    renderStatus("Não consegui carregar os filmes", err.message, true);
  }
}

/* ------------------------------------------------------------------ a ficha */

async function openFicha(id) {
  if (!id) return;

  dom.dialogBody.innerHTML = "";
  if (!dom.dialog.open) dom.dialog.showModal();

  try {
    let movie;
    if (S.mode === "offline") {
      movie = S.items.find((item) => String(item.id) === String(id));
      if (!movie) throw new Error("Esta ficha não está no arquivo local de exemplo.");
    } else {
      movie = await api(`/movies/${encodeURIComponent(id)}`);
    }
    dom.dialogBody.innerHTML = fichaMarkup(movie);
    dom.dialog.querySelector("#ficha-title")?.focus?.();
  } catch (err) {
    dom.dialogBody.innerHTML = `<p class="status status--error"><strong>Não abri a ficha</strong>${esc(err.message)}</p>`;
  }
}

/* ---------------------------------------------------- modo local (fallback) */

async function bootOffline() {
  setMode("offline");
  try {
    const res = await fetch("./demo-data.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    renderChips(data.genres || []);
    S.items = data.results || [];
    S.page = 1;
    S.totalPages = 1;
    S.view = { kind: "trending", window: "week" };

    dom.grid.setAttribute("aria-busy", "false");
    dom.grid.innerHTML = S.items.map(frameMarkup).join("");
    dom.shelfTitle.textContent = "Catálogo de exemplo";
    dom.shelfMeta.textContent = `${S.items.length} títulos · arquivo local`;
    if (S.items.length) renderBillboard(S.items[0]);
    syncChips();
    showNote(
      "A API não respondeu, então mostrei o catálogo de exemplo embutido no projeto. " +
        "Rode ./run.sh e recarregue a página para usar o backend.",
    );
  } catch {
    dom.grid.setAttribute("aria-busy", "false");
    dom.grid.innerHTML = "";
    renderStatus(
      "Nada para mostrar",
      "Não encontrei a API em /api nem o arquivo demo-data.json. Inicie o servidor com ./run.sh e recarregue.",
      true,
    );
  }
}

/* -------------------------------------------------------------------- boot */

async function boot() {
  dom.grid.innerHTML = skeletonMarkup(8);

  try {
    const health = await api("/health");
    setMode(health.mode);

    const genres = await api("/genres").catch(() => ({ genres: [] }));
    renderChips(genres.genres || []);

    await load({ kind: "trending", window: "week" });
  } catch {
    await bootOffline();
  }
}

/* ---------------------------------------------------------------- eventos */

dom.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const term = dom.q.value.trim();
  if (term) load({ kind: "search", q: term });
});

let searchTimer;
dom.q.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const term = dom.q.value.trim();
  searchTimer = setTimeout(() => {
    if (!term) load({ kind: "trending", window: "week" });
    else if (term.length >= 2) load({ kind: "search", q: term });
  }, 350);
});

dom.chips.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  const id = chip.dataset.genre;
  if (!id) load({ kind: "trending", window: "week" });
  else load({ kind: "genre", id, name: chip.dataset.name });
});

dom.more.addEventListener("click", () => {
  dom.more.disabled = true;
  load(S.view, { append: true }).finally(() => {
    dom.more.disabled = false;
  });
});

dom.grid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-id]");
  if (card) openFicha(card.dataset.id);
});

dom.grid.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".frame");
  if (!card) return;
  event.preventDefault();
  openFicha(card.dataset.id);
});

dom.billboard.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (button) openFicha(button.dataset.id);
});

dom.close.addEventListener("click", () => dom.dialog.close());
dom.dialog.addEventListener("click", (event) => {
  if (event.target === dom.dialog) dom.dialog.close();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== dom.q) {
    event.preventDefault();
    dom.q.focus();
  }
});

boot();
