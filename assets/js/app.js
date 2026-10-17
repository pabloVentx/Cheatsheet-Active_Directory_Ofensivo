/* ============================================================
   AD OFENSIVO — app.js
   SPA estática sin build step. Todo el contenido se sirve como
   markdown plano + content/manifest.json. Añadir una técnica o
   herramienta nueva = crear el .md con la plantilla + añadir una
   línea al manifest. No hace falta tocar este fichero.
   ============================================================ */
(function () {
  "use strict";

  const state = {
    manifest: null,
    /** id -> {id, kind:'tecnica'|'herramienta', faseId, title, resumen, tags, dificultad, body} */
    index: new Map(),
  };

  const $main = document.getElementById("main");
  const $searchInput = document.getElementById("search-input");
  const $searchCount = document.getElementById("search-count");

  const DIFICULTAD_META = {
    basico: { label: "Básico", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    intermedio: { label: "Intermedio", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
    avanzado: { label: "Avanzado", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
  };

  boot();

  async function boot() {
    document.getElementById("year").textContent = new Date().getFullYear();

    try {
      const res = await fetch("content/manifest.json");
      state.manifest = await res.json();
    } catch (e) {
      $main.innerHTML = `<p class="text-red-400 text-sm">No se pudo cargar <code>content/manifest.json</code>. Si has abierto el archivo con doble clic (file://), sírvelo con un servidor local — el navegador bloquea fetch() sobre file://.</p>`;
      return;
    }

    await loadAllContent();
    renderSidebar();
    renderMain();
    wireMobileSidebar();
    wireSearch();
  }

  // ---------------- content loading ----------------

  async function loadAllContent() {
    const jobs = [];
    for (const fase of state.manifest.fases) {
      for (const t of fase.tecnicas) jobs.push(loadEntry(t.id, "tecnica", t.file, fase.id));
    }
    for (const h of state.manifest.herramientas) jobs.push(loadEntry(h.id, "herramienta", h.file, null));
    await Promise.all(jobs);
  }

  async function loadEntry(id, kind, file, faseId) {
    try {
      const raw = await (await fetch(file)).text();
      const { meta, body } = parseFrontmatter(raw);
      state.index.set(id, {
        id, kind, faseId, file,
        title: meta.title || id,
        resumen: meta.resumen || "",
        dificultad: meta.dificultad || "",
        tags: (meta.tags || "").split(",").map((s) => s.trim()).filter(Boolean),
        body,
      });
    } catch (e) {
      state.index.set(id, { id, kind, faseId, file, title: id, resumen: "", dificultad: "", tags: [], body: `*No se pudo cargar \`${file}\`.*` });
    }
  }

  function parseFrontmatter(raw) {
    const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!m) return { meta: {}, body: raw };
    const meta = {};
    m[1].split("\n").forEach((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return;
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    return { meta, body: m[2] };
  }

  // ---------------- sidebar ----------------

  function buildSidebarContent() {
    const wrap = document.createElement("div");
    wrap.className = "flex flex-col gap-7";

    // Profile card
    wrap.innerHTML += `
      <div>
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center font-mono font-bold text-emerald-400">PV</div>
          <div>
            <p class="text-sm font-semibold text-slate-100">pabloVentx</p>
            <p class="text-xs text-slate-500">Apuntes de pentesting</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed mt-3">
          Cheatsheet personal de Active Directory ofensivo: reconocimiento, credenciales, abuso de configuración, movimiento lateral, persistencia y conexión remota — en construcción continua.
        </p>
        <a href="https://github.com/pabloVentx" target="_blank" rel="noopener"
           class="mt-3 inline-flex items-center gap-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md px-3 py-2 transition-colors">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.1 3.29 9.4 7.86 10.93.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.7 1.25 3.36.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.8 1.18 1.83 1.18 3.09 0 4.43-2.69 5.41-5.26 5.69.42.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .3.21.66.79.55A10.52 10.52 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z"/></svg>
          github.com/pabloVentx
        </a>
      </div>
    `;

    // Index / nav
    const nav = document.createElement("div");
    nav.innerHTML = `<p class="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">Índice</p>`;
    const navList = document.createElement("div");
    navList.className = "flex flex-col gap-0.5";
    state.manifest.fases.forEach((fase, i) => {
      const a = document.createElement("a");
      a.href = `#fase-${fase.id}`;
      a.className = "sidebar-nav-link group flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 rounded-md px-2 py-1.5 hover:bg-slate-800/60 transition-colors";
      a.innerHTML = `<span class="font-mono text-[11px] text-slate-600 group-hover:text-emerald-500 w-5 shrink-0">${String(i).padStart(2, "0")}</span><span>${escapeHtml(fase.titulo)}</span>`;
      navList.appendChild(a);
    });
    const aTools = document.createElement("a");
    aTools.href = "#herramientas";
    aTools.className = "sidebar-nav-link group flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 rounded-md px-2 py-1.5 hover:bg-slate-800/60 transition-colors mt-1 border-t border-slate-800/80 pt-2.5";
    aTools.innerHTML = `<span class="font-mono text-[11px] text-slate-600 group-hover:text-cyan-500 w-5 shrink-0">⚙</span><span>Herramientas</span>`;
    navList.appendChild(aTools);
    nav.appendChild(navList);
    wrap.appendChild(nav);

    return wrap;
  }

  function renderSidebar() {
    document.getElementById("sidebar-desktop").appendChild(buildSidebarContent());
    document.getElementById("sidebar-mobile").appendChild(buildSidebarContent());
    // clicking a nav link on mobile should also close the drawer
    document.querySelectorAll("#sidebar-mobile .sidebar-nav-link").forEach((a) =>
      a.addEventListener("click", closeMobileSidebar)
    );
  }

  // ---------------- main content ----------------

  function renderMain() {
    const frag = document.createDocumentFragment();

    state.manifest.fases.forEach((fase, i) => {
      const section = document.createElement("section");
      section.id = `fase-${fase.id}`;
      section.dataset.section = "";
      section.innerHTML = `
        <div class="flex items-baseline gap-3 mb-1.5">
          <span class="font-mono text-xs text-emerald-500/70">${String(i).padStart(2, "0")}</span>
          <h2 class="text-xl sm:text-2xl font-bold text-white">${escapeHtml(fase.titulo)}</h2>
        </div>
        <p class="text-sm text-slate-400 max-w-3xl mb-6">${escapeHtml(fase.descripcion)}</p>
      `;
      const grid = document.createElement("div");
      grid.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5";
      fase.tecnicas.forEach((t) => grid.appendChild(buildCard(state.index.get(t.id), fase)));
      section.appendChild(grid);
      frag.appendChild(section);
    });

    // Herramientas section
    const toolSection = document.createElement("section");
    toolSection.id = "herramientas";
    toolSection.dataset.section = "";
    toolSection.innerHTML = `
      <div class="flex items-baseline gap-3 mb-1.5">
        <span class="font-mono text-xs text-cyan-500/70">⚙</span>
        <h2 class="text-xl sm:text-2xl font-bold text-white">Herramientas</h2>
      </div>
      <p class="text-sm text-slate-400 max-w-3xl mb-6">Fichas de referencia rápida de cada herramienta — comandos, flags y en qué técnicas se usa.</p>
    `;
    const toolGrid = document.createElement("div");
    toolGrid.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5";
    state.manifest.herramientas.forEach((h) => toolGrid.appendChild(buildCard(state.index.get(h.id), null)));
    toolSection.appendChild(toolGrid);
    frag.appendChild(toolSection);

    $main.innerHTML = "";
    $main.appendChild(frag);
  }

  function buildCard(entry, fase) {
    const card = document.createElement("article");
    card.id = `card-${entry.id}`;
    card.dataset.cardId = entry.id;
    const searchBlob = [entry.title, entry.resumen, entry.tags.join(" "), entry.dificultad, fase ? fase.titulo : "herramienta"]
      .join(" ").toLowerCase();
    card.dataset.search = searchBlob;
    card.className = "group rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-emerald-500/40 transition-colors duration-150 overflow-hidden flex flex-col";

    const badges = [];
    if (entry.dificultad && DIFICULTAD_META[entry.dificultad]) {
      const d = DIFICULTAD_META[entry.dificultad];
      badges.push(`<span class="text-[10px] font-mono uppercase tracking-wide border rounded-full px-2 py-0.5 ${d.cls}">${d.label}</span>`);
    }
    if (fase) {
      badges.push(`<span class="text-[10px] font-mono uppercase tracking-wide border rounded-full px-2 py-0.5 bg-sky-500/10 text-sky-400 border-sky-500/30">${escapeHtml(fase.titulo)}</span>`);
    } else {
      badges.push(`<span class="text-[10px] font-mono uppercase tracking-wide border rounded-full px-2 py-0.5 bg-cyan-500/10 text-cyan-400 border-cyan-500/30">Herramienta</span>`);
    }

    const toolChips = entry.kind === "tecnica" && entry.tags.length
      ? `<div class="flex flex-wrap gap-1.5 mt-3">${entry.tags.map((tagId) => toolChipHtml(tagId)).join("")}</div>`
      : "";

    card.innerHTML = `
      <div class="p-5 flex-1 flex flex-col">
        <div class="flex flex-wrap gap-1.5 mb-3">${badges.join("")}</div>
        <h3 class="text-base font-semibold text-slate-100 mb-1.5 leading-snug">${escapeHtml(entry.title)}</h3>
        <p class="text-sm text-slate-400 leading-relaxed">${escapeHtml(entry.resumen)}</p>
        ${toolChips}
        <button type="button" class="toggle-btn mt-4 inline-flex items-center gap-1.5 text-xs font-mono font-medium text-emerald-400 hover:text-emerald-300 self-start">
          <span class="btn-label">Ver comandos</span>
          <svg class="chevron w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
      </div>
      <div class="expand hidden border-t border-slate-800 bg-slate-950/50">
        <div class="md-body p-5"></div>
      </div>
    `;

    const btn = card.querySelector(".toggle-btn");
    const expand = card.querySelector(".expand");
    const label = card.querySelector(".btn-label");
    let rendered = false;
    btn.addEventListener("click", () => {
      const willOpen = expand.classList.contains("hidden");
      if (willOpen && !rendered) {
        card.querySelector(".md-body").innerHTML = renderMarkdown(entry.body);
        enhanceCodeBlocks(card.querySelector(".md-body"));
        rendered = true;
      }
      expand.classList.toggle("hidden");
      btn.classList.toggle("expanded", willOpen);
      label.textContent = willOpen ? "Ocultar" : "Ver comandos";
    });

    return card;
  }

  function toolChipHtml(tagId) {
    const tool = state.index.get(tagId);
    if (!tool) return "";
    return `<a href="#card-${tagId}" class="wikilink-jump inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 bg-slate-800/80 border border-slate-700 hover:border-cyan-500/50 rounded-full px-2.5 py-1 transition-colors" data-jump="${tagId}">⚙ ${escapeHtml(tool.title)}</a>`;
  }

  // ---------------- markdown rendering ----------------

  function renderMarkdown(md) {
    const withLinks = md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, id, label) => {
      const cleanId = id.trim();
      const target = state.index.get(cleanId);
      const text = (label || (target ? target.title : cleanId)).trim();
      return target
        ? `<a href="#card-${cleanId}" class="wikilink wikilink-jump" data-jump="${cleanId}">${text}</a>`
        : `<span class="text-red-400">${text}</span>`;
    });
    if (window.marked) {
      window.marked.setOptions({ gfm: true, breaks: false });
      return window.marked.parse(withLinks);
    }
    return `<pre>${escapeHtml(withLinks)}</pre>`;
  }

  function enhanceCodeBlocks(container) {
    if (!container) return;
    container.querySelectorAll("pre code").forEach((block) => {
      if (window.hljs) {
        try { window.hljs.highlightElement(block); } catch (e) {}
      }
    });
    container.querySelectorAll("pre").forEach((pre) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "copiar";
      btn.addEventListener("click", () => {
        const code = pre.querySelector("code");
        navigator.clipboard.writeText(code ? code.textContent : pre.textContent).then(() => {
          btn.textContent = "¡copiado!";
          setTimeout(() => (btn.textContent = "copiar"), 1300);
        });
      });
      pre.appendChild(btn);
    });
  }

  // ---------------- jump-to-card (wikilinks + tool chips) ----------------

  document.addEventListener("click", (e) => {
    const link = e.target.closest(".wikilink-jump");
    if (!link) return;
    e.preventDefault();
    const id = link.dataset.jump;
    const target = document.getElementById(`card-${id}`);
    if (!target) return;
    closeMobileSidebar();
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const btn = target.querySelector(".toggle-btn");
    if (btn && target.querySelector(".expand").classList.contains("hidden")) btn.click();
    target.classList.add("card-flash");
    setTimeout(() => target.classList.remove("card-flash"), 1400);
  });

  // ---------------- search ----------------

  function wireSearch() {
    const cards = () => Array.from(document.querySelectorAll("article[data-card-id]"));
    const sections = () => Array.from(document.querySelectorAll("section[data-section]"));

    $searchInput.addEventListener("input", () => {
      const q = $searchInput.value.trim().toLowerCase();
      let visible = 0;
      cards().forEach((card) => {
        const match = !q || card.dataset.search.includes(q);
        card.classList.toggle("hidden", !match);
        if (match) visible++;
      });
      sections().forEach((section) => {
        const anyVisible = section.querySelectorAll('article[data-card-id]:not(.hidden)').length > 0;
        section.classList.toggle("hidden", !anyVisible);
      });
      $searchCount.textContent = q ? `${visible} resultado${visible === 1 ? "" : "s"}` : "";
    });
  }

  // ---------------- mobile sidebar ----------------

  function wireMobileSidebar() {
    const sidebar = document.getElementById("mobile-sidebar");
    const scrim = document.getElementById("scrim");
    document.getElementById("open-mobile").addEventListener("click", () => {
      sidebar.classList.remove("-translate-x-full");
      scrim.classList.remove("hidden");
    });
    document.getElementById("close-mobile").addEventListener("click", closeMobileSidebar);
    scrim.addEventListener("click", closeMobileSidebar);
  }

  function closeMobileSidebar() {
    document.getElementById("mobile-sidebar")?.classList.add("-translate-x-full");
    document.getElementById("scrim")?.classList.add("hidden");
  }

  // ---------------- utils ----------------

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
})();
