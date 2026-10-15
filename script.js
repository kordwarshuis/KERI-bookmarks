const STORAGE_KEY = "keri-bookmarks-layout";
const TRANSIENT_CLASSES = [
  "is-ghost",
  "is-chosen",
  "sortable-chosen",
  "sortable-ghost",
  "sortable-drag",
  "sortable-fallback",
  "hidden-section",
  "edit-mode",
];

const filterInput = document.querySelector("#filter");
const empty = document.querySelector("#empty");
const main = document.querySelector("main");
const bookmarkDialog = document.querySelector("#bookmark-dialog");
const sectionDialog = document.querySelector("#section-dialog");
const helpDialog = document.querySelector("#help-dialog");
const sortables = [];

let state = loadState() || blankState();
let editingId = null;
let editingSection = null;
let statusTimer = 0;

function blankState() {
  return {
    v: 1,
    sectionOrder: [],
    cardOrder: {},
    addedCards: {},
    customCards: {},
    addedSections: {},
    customSections: {},
    removed: [],
    removedSections: [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return {
      ...blankState(),
      ...data,
      removed: Array.isArray(data.removed) ? data.removed : [],
      removedSections: Array.isArray(data.removedSections) ? data.removedSections : [],
    };
  } catch {
    return null;
  }
}

function normalize(value) {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function slug(value) {
  const text = normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return text.slice(0, 60);
}

function uniqueId(base, taken) {
  const root = slug(base) || "item";
  let candidate = root;
  let n = 2;
  while (taken(candidate)) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  return candidate;
}

function hash(value) {
  let h = 0;
  for (const char of value) h = (h * 31 + char.codePointAt(0)) >>> 0;
  return h;
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function httpUrl(value) {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Use an http or https link.");
  }
  return url.href;
}

function setStatus(message, ttl = 4000) {
  const el = document.querySelector("#editor-status");
  if (!el) return;
  el.textContent = message;
  window.clearTimeout(statusTimer);
  if (message) {
    statusTimer = window.setTimeout(() => {
      el.textContent = "";
    }, ttl);
  }
}

function assignIds(root) {
  const used = new Set(
    [...root.querySelectorAll(".card")].map((card) => card.dataset.id).filter(Boolean),
  );
  root.querySelectorAll(".card").forEach((card) => {
    if (card.dataset.id) return;
    const title = card.querySelector("h3")?.textContent.trim() || "bookmark";
    card.dataset.id = uniqueId(title, (id) => used.has(id));
    used.add(card.dataset.id);
  });
}

function elementFromHTML(html) {
  const holder = document.createElement("template");
  holder.innerHTML = html.trim();
  return holder.content.firstElementChild;
}

function applySectionMeta(section, meta) {
  if (!section || !meta) return;
  const heading = section.querySelector("h2");
  if (heading) heading.textContent = meta.title;
  const blurb = section.querySelector(".section-head p");
  if (blurb) blurb.textContent = meta.description || "";
  section.classList.toggle("is-draft", Boolean(meta.draft));
  ensureNavLink(section.id, meta.title);
}

function applyState() {
  if (!localStorage.getItem(STORAGE_KEY)) return;

  (state.removedSections || []).forEach((id) => {
    const section = document.getElementById(id);
    if (!section) return;
    section.remove();
    document.querySelector(`.header-nav a[href="#${CSS.escape(id)}"]`)?.remove();
  });

  assignIds(document);
  const cards = new Map();
  document.querySelectorAll(".card").forEach((card) => cards.set(card.dataset.id, card));

  const removed = new Set(state.removed || []);
  removed.forEach((id) => {
    const card = cards.get(id);
    if (!card) return;
    card.remove();
    cards.delete(id);
  });

  Object.entries(state.customCards || {}).forEach(([id, html]) => {
    const current = cards.get(id);
    if (!current) return;
    const next = elementFromHTML(html);
    if (!next) return;
    next.dataset.id = id;
    next.dataset.custom = "true";
    current.replaceWith(next);
    cards.set(id, next);
  });

  Object.entries(state.addedCards || {}).forEach(([id, html]) => {
    if (cards.has(id) || removed.has(id)) return;
    const card = elementFromHTML(html);
    if (!card) return;
    card.dataset.id = id;
    card.dataset.added = "true";
    cards.set(id, card);
  });

  Object.entries(state.addedSections || {}).forEach(([id, meta]) => {
    if ((state.removedSections || []).includes(id)) return;
    const existing = document.getElementById(id);
    if (existing) {
      existing.dataset.added = "true";
      applySectionMeta(existing, meta);
      const mark = existing.querySelector(".section-mark");
      mark?.replaceWith(elementFromHTML(sectionMark(Boolean(meta.draft))));
      return;
    }
    main.appendChild(buildSection(meta));
    ensureNavLink(id, meta.title);
  });

  Object.entries(state.customSections || {}).forEach(([id, meta]) => {
    const section = document.getElementById(id);
    if (!section || section.dataset.added === "true") return;
    section.dataset.custom = "true";
    applySectionMeta(section, meta);
  });

  const knownSections = new Set(state.sectionOrder || []);
  const leftoverSections = [...main.querySelectorAll(":scope > .section")].filter(
    (section) => !knownSections.has(section.id),
  );
  (state.sectionOrder || []).forEach((id) => {
    const section = document.getElementById(id);
    if (section) main.appendChild(section);
  });
  leftoverSections.forEach((section) => main.appendChild(section));

  const placed = new Set();
  document.querySelectorAll(".section").forEach((section) => {
    const grid = section.querySelector(".grid");
    if (!grid) return;
    const ids = state.cardOrder?.[section.id] || [];
    const locals = [...grid.querySelectorAll(":scope > .card")].filter(
      (card) => !ids.includes(card.dataset.id),
    );
    ids.forEach((id) => {
      const card = cards.get(id);
      if (!card || removed.has(id)) return;
      grid.appendChild(card);
      placed.add(id);
    });
    locals.forEach((card) => {
      grid.appendChild(card);
      placed.add(card.dataset.id);
    });
  });

  cards.forEach((card, id) => {
    if (placed.has(id) || card.isConnected) return;
    const home = Object.entries(state.cardOrder || {}).find(([, ids]) => ids.includes(id))?.[0];
    const grid = (home && document.getElementById(home)?.querySelector(".grid")) || document.querySelector(".grid");
    grid?.appendChild(card);
  });
}

function cardRecordHTML(card) {
  const clone = card.cloneNode(true);
  TRANSIENT_CLASSES.forEach((name) => clone.classList.remove(name));
  clone.removeAttribute("draggable");
  return clone.outerHTML;
}

function snapshot() {
  const next = {
    ...blankState(),
    removed: [...state.removed],
    removedSections: [...state.removedSections],
  };
  document.querySelectorAll(".section").forEach((section) => {
    next.sectionOrder.push(section.id);
    next.cardOrder[section.id] = [...section.querySelectorAll(".card")].map((card) => card.dataset.id);
    const meta = sectionMeta(section);
    if (section.dataset.added === "true") next.addedSections[section.id] = meta;
    else if (section.dataset.custom === "true") next.customSections[section.id] = meta;
  });
  document.querySelectorAll(".card[data-added='true']").forEach((card) => {
    next.addedCards[card.dataset.id] = cardRecordHTML(card);
  });
  document.querySelectorAll(".card[data-custom='true']").forEach((card) => {
    if (card.dataset.added === "true") return;
    next.customCards[card.dataset.id] = cardRecordHTML(card);
  });
  state = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function appendNavItem(nav, node) {
  const help = nav.querySelector("#editor-help");
  if (help) nav.insertBefore(node, help);
  else nav.appendChild(node);
}

function renumber() {
  const nav = document.querySelector(".header-nav");
  document.querySelectorAll(".section").forEach((section, index) => {
    const num = section.querySelector(".section-num");
    if (num) num.textContent = String(index + 1).padStart(2, "0");
    const link = nav?.querySelector(`a[href="#${CSS.escape(section.id)}"]`);
    if (link) appendNavItem(nav, link);
  });
}

function ensureNavLink(id, title) {
  const nav = document.querySelector(".header-nav");
  if (!nav) return;
  let link = nav.querySelector(`a[href="#${CSS.escape(id)}"]`);
  if (!link) {
    link = document.createElement("a");
    link.href = `#${id}`;
    appendNavItem(nav, link);
  }
  link.textContent = title;
}

function gripButton(className, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="3.5" r="1.2" fill="currentColor"/><circle cx="11" cy="3.5" r="1.2" fill="currentColor"/><circle cx="5" cy="8" r="1.2" fill="currentColor"/><circle cx="11" cy="8" r="1.2" fill="currentColor"/><circle cx="5" cy="12.5" r="1.2" fill="currentColor"/><circle cx="11" cy="12.5" r="1.2" fill="currentColor"/></svg>`;
  return button;
}

function iconButton(className, label, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.textContent = text;
  return button;
}

function decorateSection(section) {
  const head = section.querySelector(".section-head");
  if (!head || head.querySelector(".section-tools")) return;
  const tools = document.createElement("div");
  tools.className = "section-tools";
  const rename = iconButton("section-rename", "Rename section", "✎");
  const remove = iconButton("section-remove", "Remove section", "×");
  rename.addEventListener("click", () => openSectionDialog(section));
  remove.addEventListener("click", () => removeSection(section));
  tools.append(gripButton("section-grip", "Drag section"), rename, remove);
  head.prepend(tools);
}

function sectionMeta(section) {
  return {
    id: section.id,
    title: section.querySelector("h2")?.textContent.trim() || section.id,
    description: section.querySelector(".section-head p")?.textContent.trim() || "",
    draft: section.classList.contains("is-draft"),
  };
}

function writeSection(section, meta) {
  applySectionMeta(section, meta);
  if (section.dataset.added === "true") {
    const mark = section.querySelector(".section-mark");
    mark?.replaceWith(elementFromHTML(sectionMark(Boolean(meta.draft))));
  } else {
    section.dataset.custom = "true";
  }
}

function lockSlotSize(slot, card) {
  const sync = () => {
    if (slot.matches(":hover, :focus-within")) return;
    slot.style.minHeight = `${Math.ceil(card.getBoundingClientRect().height)}px`;
  };
  sync();
  requestAnimationFrame(sync);
  if (document.fonts?.ready) document.fonts.ready.then(sync);
  slot._syncSize = sync;
}

function wrapCard(card) {
  if (card.closest(".slot")) return card.closest(".slot");
  const slot = document.createElement("div");
  slot.className = "slot";
  const bar = document.createElement("div");
  bar.className = "slot-bar";
  const grip = gripButton("grip", "Drag bookmark");
  const edit = iconButton("slot-edit", "Edit bookmark", "✎");
  const remove = iconButton("slot-remove", "Remove bookmark", "×");
  edit.addEventListener("click", () => openBookmarkDialog(card));
  remove.addEventListener("click", () => removeCard(card));
  bar.append(grip, edit, remove);
  card.before(slot);
  slot.append(bar, card);
  lockSlotSize(slot, card);
  return slot;
}

function bindGrid(grid) {
  if (!grid || grid.dataset.sortable === "true" || typeof Sortable === "undefined") return;
  grid.dataset.sortable = "true";
  sortables.push(Sortable.create(grid, {
    group: "bookmarks",
    animation: 160,
    handle: ".grip",
    draggable: ".slot",
    ghostClass: "is-ghost",
    chosenClass: "is-chosen",
    emptyInsertThreshold: 48,
    onEnd: () => {
      snapshot();
      setStatus("Arrangement saved in this browser.");
      filterBookmarks();
    },
  }));
}

function bindSections() {
  if (typeof Sortable === "undefined") return;
  sortables.push(Sortable.create(main, {
    animation: 160,
    handle: ".section-grip",
    draggable: ".section",
    ghostClass: "is-ghost",
    chosenClass: "is-chosen",
    onEnd: () => {
      renumber();
      snapshot();
      setStatus("Arrangement saved in this browser.");
    },
  }));
}

function setSortingEnabled(enabled) {
  sortables.forEach((sortable) => sortable.option("disabled", !enabled));
}

function isEditMode() {
  return document.body.classList.contains("edit-mode");
}

function syncSorting() {
  const query = normalize(filterInput?.value.trim() || "");
  setSortingEnabled(isEditMode() && query === "");
}

function setEditMode(enabled) {
  document.body.classList.toggle("edit-mode", enabled);
  const toggle = document.querySelector("#toggle-edit");
  if (toggle) {
    toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggle.textContent = enabled ? "Done editing" : "Edit layout";
  }
  syncSorting();
  setStatus(enabled ? "Edit controls visible. Drag handles to rearrange." : "Edit controls hidden.");
}

function filterBookmarks() {
  const query = normalize(filterInput?.value.trim() || "");
  let visible = 0;
  document.querySelectorAll("[data-bookmark]").forEach((card) => {
    const match = query === "" || normalize(card.dataset.bookmark || "").includes(query);
    card.classList.toggle("hidden-section", !match);
    card.closest(".slot")?.classList.toggle("hidden-section", !match);
    if (match) visible += 1;
  });
  document.querySelectorAll(".section").forEach((section) => {
    const any = section.querySelector("[data-bookmark]:not(.hidden-section)");
    section.classList.toggle("hidden-section", Boolean(query) && !any);
  });
  if (empty) empty.hidden = visible !== 0;
  syncSorting();
}

function illustration(seed) {
  const palettes = [
    { bg: "#e7efe4", paper: "#fffdf8", ink: "#1c2b22", leaf: "#2a6b4a", copper: "#a85a32" },
    { bg: "#efe6d4", paper: "#fffdf8", ink: "#1c2b22", leaf: "#2a6b4a", copper: "#a85a32" },
    { bg: "#dfeadf", paper: "#f4eee3", ink: "#1c2b22", leaf: "#163828", copper: "#a85a32" },
    { bg: "#f3ead4", paper: "#fffdf8", ink: "#1c2b22", leaf: "#2a6b4a", copper: "#8a6a2a" },
  ];
  const palette = palettes[hash(seed) % palettes.length];
  const bodies = [
    `<circle cx="160" cy="70" r="36" fill="${palette.paper}" stroke="${palette.ink}" stroke-width="2"/>
     <circle cx="160" cy="70" r="18" fill="none" stroke="${palette.leaf}" stroke-width="5"/>
     <path d="M146 70c8-14 20-14 28 0-8 14-20 14-28 0z" fill="none" stroke="${palette.copper}" stroke-width="3"/>
     <circle cx="160" cy="70" r="4" fill="${palette.ink}"/>`,
    `<g fill="${palette.paper}" stroke="${palette.ink}" stroke-width="1.8">
       <rect x="48" y="28" width="68" height="84" rx="8"/>
       <rect x="126" y="22" width="68" height="96" rx="8"/>
       <rect x="204" y="28" width="68" height="84" rx="8"/>
     </g>
     <path d="M64 52h36M64 68h28M142 48h36M142 64h24M220 52h36" stroke="${palette.leaf}" stroke-width="3" stroke-linecap="round"/>
     <circle cx="160" cy="96" r="6" fill="${palette.copper}"/>`,
    `<path d="M46 102c30-52 68-70 114-70s84 18 114 70" fill="none" stroke="${palette.leaf}" stroke-width="3.5" stroke-linecap="round"/>
     <circle cx="160" cy="48" r="12" fill="${palette.copper}"/>
     <circle cx="92" cy="78" r="8" fill="${palette.ink}"/>
     <circle cx="228" cy="78" r="8" fill="${palette.ink}"/>
     <path d="M100 78h44M176 78h44" stroke="${palette.copper}" stroke-width="2" stroke-dasharray="4 4"/>`,
    `<rect x="70" y="24" width="180" height="92" rx="14" fill="${palette.ink}"/>
     <path d="M142 50l44 22-44 22z" fill="${palette.paper}"/>
     <circle cx="98" cy="44" r="5" fill="${palette.leaf}"/>
     <circle cx="222" cy="96" r="5" fill="${palette.copper}"/>`,
  ];
  const body = bodies[hash(`${seed}:art`) % bodies.length];
  return elementFromHTML(
    `<svg viewBox="0 0 320 140" preserveAspectRatio="xMidYMid meet"><rect width="320" height="140" fill="${palette.bg}"/>${body}</svg>`,
  );
}

function sectionMark(draft) {
  if (draft) {
    return `<svg class="section-mark" viewBox="0 0 160 110" aria-hidden="true"><rect width="160" height="110" rx="16" fill="#f3ead4" stroke="#1c2b22" stroke-width="1.6" stroke-dasharray="6 4"/><circle cx="80" cy="54" r="22" fill="none" stroke="#8a6a2a" stroke-width="3"/><path d="M68 54h24" stroke="#8a6a2a" stroke-width="3" stroke-linecap="round"/></svg>`;
  }
  return `<svg class="section-mark" viewBox="0 0 160 110" aria-hidden="true"><rect width="160" height="110" rx="16" fill="#e7efe4" stroke="#1c2b22" stroke-width="1.6"/><circle cx="80" cy="54" r="26" fill="none" stroke="#2a6b4a" stroke-width="6"/><path d="M62 54c10-16 26-16 36 0-10 16-26 16-36 0z" fill="none" stroke="#a85a32" stroke-width="3.5" stroke-linecap="round"/><circle cx="80" cy="54" r="4" fill="#1c2b22"/></svg>`;
}

function buildSection(meta) {
  const section = document.createElement("section");
  section.className = meta.draft ? "section is-draft" : "section";
  section.id = meta.id;
  section.dataset.added = "true";
  const header = document.createElement("header");
  header.className = "section-head";
  const num = document.createElement("span");
  num.className = "section-num";
  num.textContent = "00";
  const copy = document.createElement("div");
  const heading = document.createElement("h2");
  heading.textContent = meta.title;
  const blurb = document.createElement("p");
  blurb.textContent = meta.description || "";
  copy.append(heading, blurb);
  header.append(num, copy);
  header.appendChild(elementFromHTML(sectionMark(Boolean(meta.draft))));
  const grid = document.createElement("div");
  grid.className = "grid";
  section.append(header, grid);
  return section;
}

function mountSection(meta) {
  const section = buildSection(meta);
  main.appendChild(section);
  ensureNavLink(meta.id, meta.title);
  decorateSection(section);
  bindGrid(section.querySelector(".grid"));
  renumber();
  return section;
}

function repoIcon() {
  return elementFromHTML(
    `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3h6v6M11 3 3 11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  );
}

function buildCard(fields) {
  const card = document.createElement(fields.repo ? "div" : "a");
  card.className = "card";
  card.dataset.id = fields.id;
  card.dataset.bookmark = fields.keywords;
  if (fields.added) card.dataset.added = "true";
  if (!fields.repo) {
    card.href = fields.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
  }

  const art = document.createElement("div");
  art.className = "card-art";
  art.setAttribute("aria-hidden", "true");
  art.appendChild(illustration(fields.title));

  const body = document.createElement("div");
  body.className = "card-body";
  const heading = document.createElement("h3");
  if (fields.repo) {
    const link = document.createElement("a");
    link.className = "stretched";
    link.href = fields.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = fields.title;
    heading.appendChild(link);
  } else {
    heading.textContent = fields.title;
  }
  const description = document.createElement("p");
  description.textContent = fields.description;
  const host = document.createElement("span");
  host.className = "host";
  host.textContent = hostname(fields.url);
  body.append(heading, description, host);
  if (fields.repo) {
    const repo = document.createElement("a");
    repo.className = "repo-link";
    repo.href = fields.repo;
    repo.target = "_blank";
    repo.rel = "noopener noreferrer";
    repo.append("GitHub repository", repoIcon());
    body.appendChild(repo);
  }
  card.append(art, body);
  return card;
}

function readCard(card) {
  const stretched = card.querySelector("h3 a");
  const self = card.matches("a.card") ? card : null;
  const repo = card.querySelector(".repo-link");
  return {
    id: card.dataset.id,
    title: card.querySelector("h3")?.textContent.trim() || "",
    description: card.querySelector(".card-body p")?.textContent.trim() || "",
    url: (self || stretched)?.getAttribute("href") || "",
    repo: repo?.getAttribute("href") || "",
    keywords: card.dataset.bookmark || "",
    sectionId: card.closest(".section")?.id || "",
  };
}

function setDestination(card, url) {
  if (card.matches("a[href]")) card.href = url;
  card.querySelectorAll("a.stretched, a.card-art").forEach((link) => {
    link.href = url;
  });
}

function convertAnchorCard(card) {
  if (!card.matches("a.card")) return card;
  const div = document.createElement("div");
  [...card.attributes].forEach((attr) => {
    if (attr.name === "href" || attr.name === "target" || attr.name === "rel") return;
    div.setAttribute(attr.name, attr.value);
  });
  div.className = card.className;
  while (card.firstChild) div.appendChild(card.firstChild);
  const heading = div.querySelector("h3");
  if (heading && !heading.querySelector("a")) {
    const link = document.createElement("a");
    link.className = "stretched";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    while (heading.firstChild) link.appendChild(heading.firstChild);
    heading.appendChild(link);
  }
  card.replaceWith(div);
  return div;
}

function ensureRepoLink(card, url) {
  let repo = card.querySelector(".repo-link");
  if (!url) {
    repo?.remove();
    return;
  }
  if (!repo) {
    repo = document.createElement("a");
    repo.className = "repo-link";
    repo.target = "_blank";
    repo.rel = "noopener noreferrer";
    repo.append("GitHub repository", repoIcon());
    card.querySelector(".card-body")?.appendChild(repo);
  }
  repo.href = url;
}

function writeCard(card, fields) {
  let target = card;
  if (fields.repo) target = convertAnchorCard(card);
  target.dataset.bookmark = fields.keywords;
  setDestination(target, fields.url);
  const heading = target.querySelector("h3");
  const headingLink = heading?.querySelector("a");
  if (headingLink) headingLink.textContent = fields.title;
  else if (heading) heading.textContent = fields.title;
  let description = target.querySelector(".card-body p");
  if (!description) {
    description = document.createElement("p");
    target.querySelector(".host")?.before(description);
  }
  if (description) description.textContent = fields.description;
  let host = target.querySelector(".host");
  if (!host) {
    host = document.createElement("span");
    host.className = "host";
    target.querySelector(".card-body")?.appendChild(host);
  }
  host.textContent = hostname(fields.url);
  ensureRepoLink(target, fields.repo);
  if (target.dataset.added !== "true") target.dataset.custom = "true";
  target.closest(".slot")?._syncSize?.();
  return target;
}

function sectionOptions(selectedId) {
  return [...document.querySelectorAll(".section")].map((section) => {
    const option = document.createElement("option");
    option.value = section.id;
    option.textContent = section.querySelector("h2")?.textContent.trim() || section.id;
    option.selected = section.id === selectedId;
    return option;
  });
}

function fillSectionSelect(selectedId) {
  const select = document.querySelector("#bookmark-section");
  select.replaceChildren(...sectionOptions(selectedId));
  const created = document.createElement("option");
  created.value = "__new__";
  created.textContent = "New section…";
  select.appendChild(created);
  if (!selectedId) select.selectedIndex = 0;
}

function toggleNewSectionFields() {
  const show = document.querySelector("#bookmark-section").value === "__new__";
  const fields = document.querySelector("#new-section-fields");
  fields.hidden = !show;
  document.querySelector("#new-section-name").required = show;
}

function openBookmarkDialog(card) {
  const form = document.querySelector("#bookmark-form");
  form.reset();
  editingId = card?.dataset.id || null;
  document.querySelector("#bookmark-dialog-title").textContent = card ? "Edit bookmark" : "Add bookmark";
  document.querySelector("#bookmark-save").textContent = card ? "Save changes" : "Save bookmark";
  const current = card ? readCard(card) : null;
  fillSectionSelect(current?.sectionId);
  if (current) {
    document.querySelector("#bookmark-title").value = current.title;
    document.querySelector("#bookmark-url").value = current.url;
    document.querySelector("#bookmark-description").value = current.description;
    document.querySelector("#bookmark-keywords").value = current.keywords;
    document.querySelector("#bookmark-repo").value = current.repo;
  }
  toggleNewSectionFields();
  bookmarkDialog.showModal();
  document.querySelector("#bookmark-title").focus();
}

function keywordsFor(title, description, url, typed) {
  if (typed.trim()) return typed.trim();
  return `${title} ${description} ${hostname(url)}`.replace(/\s+/g, " ").trim().toLowerCase();
}

function takenCardId(id) {
  return Boolean(document.querySelector(`.card[data-id="${CSS.escape(id)}"]`));
}

function takenSectionId(id) {
  return Boolean(document.getElementById(id));
}

function saveBookmark(event) {
  event.preventDefault();
  let url;
  let repo = "";
  try {
    url = httpUrl(document.querySelector("#bookmark-url").value);
    const repoValue = document.querySelector("#bookmark-repo").value.trim();
    if (repoValue) repo = httpUrl(repoValue);
  } catch {
    setStatus("Enter a full http(s) link.");
    return;
  }

  const title = document.querySelector("#bookmark-title").value.trim();
  const description = document.querySelector("#bookmark-description").value.trim();
  const keywords = keywordsFor(title, description, url, document.querySelector("#bookmark-keywords").value);
  let sectionId = document.querySelector("#bookmark-section").value;

  if (sectionId === "__new__") {
    const name = document.querySelector("#new-section-name").value.trim();
    if (!name) {
      setStatus("Name the new section.");
      return;
    }
    const meta = {
      id: uniqueId(name, takenSectionId),
      title: name,
      description: document.querySelector("#new-section-description").value.trim(),
      draft: document.querySelector("#new-section-draft").checked,
    };
    mountSection(meta);
    sectionId = meta.id;
  }

  const fields = { title, url, description, keywords, repo, sectionId };
  if (editingId) {
    const card = document.querySelector(`.card[data-id="${CSS.escape(editingId)}"]`);
    if (!card) return;
    const updated = writeCard(card, fields);
    const grid = document.getElementById(sectionId)?.querySelector(".grid");
    const slot = updated.closest(".slot");
    if (grid && slot && slot.parentElement !== grid) grid.appendChild(slot);
  } else {
    const card = buildCard({
      ...fields,
      id: uniqueId(title, takenCardId),
      added: true,
    });
    const grid = document.getElementById(sectionId)?.querySelector(".grid");
    grid?.appendChild(card);
    wrapCard(card);
  }

  bookmarkDialog.close();
  snapshot();
  filterBookmarks();
  setStatus("Bookmark saved in this browser.");
}

function removeCard(card) {
  const title = card.querySelector("h3")?.textContent.trim() || "this bookmark";
  if (!window.confirm(`Remove “${title}” from this layout?`)) return;
  if (!state.removed.includes(card.dataset.id)) state.removed.push(card.dataset.id);
  (card.closest(".slot") || card).remove();
  snapshot();
  filterBookmarks();
  setStatus("Bookmark removed in this browser.");
}

function removeSection(section) {
  const title = section.querySelector("h2")?.textContent.trim() || "this section";
  const count = section.querySelectorAll(".card").length;
  const detail = count === 1 ? "1 bookmark inside it" : `${count} bookmarks inside it`;
  if (!window.confirm(`Remove the “${title}” section and the ${detail}?`)) return;
  section.querySelectorAll(".card").forEach((card) => {
    if (!state.removed.includes(card.dataset.id)) state.removed.push(card.dataset.id);
  });
  if (!state.removedSections.includes(section.id)) state.removedSections.push(section.id);
  document.querySelector(`.header-nav a[href="#${CSS.escape(section.id)}"]`)?.remove();
  section.remove();
  renumber();
  snapshot();
  filterBookmarks();
  setStatus("Section removed in this browser.");
}

function openSectionDialog(section) {
  const form = document.querySelector("#section-form");
  form.reset();
  editingSection = section || null;
  document.querySelector("#section-dialog-title").textContent = section ? "Rename section" : "Add section";
  document.querySelector("#section-save").textContent = section ? "Save section" : "Add section";
  if (section) {
    const meta = sectionMeta(section);
    document.querySelector("#section-name").value = meta.title;
    document.querySelector("#section-description").value = meta.description;
    document.querySelector("#section-draft").checked = meta.draft;
  }
  sectionDialog.showModal();
  document.querySelector("#section-name").focus();
}

function saveSection(event) {
  event.preventDefault();
  const meta = {
    title: document.querySelector("#section-name").value.trim(),
    description: document.querySelector("#section-description").value.trim(),
    draft: document.querySelector("#section-draft").checked,
  };
  if (editingSection) {
    writeSection(editingSection, meta);
    sectionDialog.close();
    snapshot();
    setStatus("Section saved in this browser.");
    return;
  }
  const section = mountSection({
    id: uniqueId(meta.title, takenSectionId),
    ...meta,
  });
  sectionDialog.close();
  snapshot();
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus("Section saved in this browser.");
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function escapeText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serializeAttrs(element) {
  return [...element.attributes].map((attr) => {
    if (attr.name === "draggable") return "";
    if (attr.value === "") return ` ${attr.name}`;
    return ` ${attr.name}="${attr.value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`;
  }).join("");
}

const INLINE_TAGS = new Set(["a", "em", "strong", "span", "code", "b", "i", "small", "br", "abbr"]);

function isInlineNode(node) {
  if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE) return true;
  return node.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has(node.tagName.toLowerCase());
}

function serializeInline(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeText(node.textContent.replace(/\s+/g, " "));
  }
  if (node.nodeType === Node.COMMENT_NODE) return `<!--${node.textContent}-->`;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.tagName.toLowerCase();
  const attrs = serializeAttrs(node);
  if (VOID_TAGS.has(tag)) return `<${tag}${attrs}>`;
  const inner = [...node.childNodes].map(serializeInline).join("");
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

function serializeNode(node, indent) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.replace(/\s+/g, " ").trim();
    return text ? `${indent}${escapeText(text)}\n` : "";
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    return `${indent}<!--${node.textContent}-->\n`;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = node.tagName.toLowerCase();
  const attrs = serializeAttrs(node);
  if (VOID_TAGS.has(tag)) return `${indent}<${tag}${attrs}>\n`;

  if (tag === "script" || tag === "style") {
    const raw = node.textContent.replace(/^\n/, "").replace(/\s+$/, "");
    if (!raw) return `${indent}<${tag}${attrs}></${tag}>\n`;
    return `${indent}<${tag}${attrs}>\n${raw}\n${indent}</${tag}>\n`;
  }

  const meaningful = [...node.childNodes].filter((child) => {
    if (child.nodeType === Node.TEXT_NODE) return child.textContent.trim() !== "";
    return child.nodeType === Node.ELEMENT_NODE || child.nodeType === Node.COMMENT_NODE;
  });
  if (meaningful.length === 0) return `${indent}<${tag}${attrs}></${tag}>\n`;
  if (meaningful.every(isInlineNode)) {
    const inner = [...node.childNodes].map(serializeInline).join("").replace(/^\s+|\s+$/g, "");
    return `${indent}<${tag}${attrs}>${inner}</${tag}>\n`;
  }
  const inner = [...node.childNodes]
    .filter((child) => child.nodeType !== Node.TEXT_NODE || child.textContent.trim() !== "")
    .map((child) => serializeNode(child, `${indent}  `))
    .join("");
  return `${indent}<${tag}${attrs}>\n${inner}${indent}</${tag}>\n`;
}

function pageHTML() {
  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll(".slot").forEach((slot) => {
    const card = slot.querySelector(".card");
    if (card) slot.replaceWith(card);
  });
  clone.querySelectorAll(".section-tools, grammarly-desktop-integration").forEach((node) => node.remove());
  clone.querySelectorAll("script").forEach((script) => {
    if (script.textContent.includes("IsThisFirstTime_Log_From_LiveServer")) script.remove();
  });
  const comments = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
  const injected = [];
  while (comments.nextNode()) {
    if (comments.currentNode.textContent.includes("live-server")) injected.push(comments.currentNode);
  }
  injected.forEach((node) => node.remove());
  clone.querySelectorAll("dialog").forEach((dialog) => dialog.removeAttribute("open"));
  clone.querySelectorAll("#editor-status").forEach((status) => {
    status.textContent = "";
  });
  const filter = clone.querySelector("#filter");
  if (filter) {
    filter.value = "";
    filter.removeAttribute("value");
  }
  [clone, ...clone.querySelectorAll("*")].forEach((element) => {
    TRANSIENT_CLASSES.forEach((name) => element.classList.remove(name));
    if (!element.getAttribute("class")) element.removeAttribute("class");
    element.removeAttribute("draggable");
    element.removeAttribute("style");
    if (element.hasAttribute("data-sortable")) element.removeAttribute("data-sortable");
  });
  return `<!DOCTYPE html>\n${serializeNode(clone, "")}`;
}

async function copyHTML() {
  const html = pageHTML();
  try {
    await navigator.clipboard.writeText(html);
    setStatus("Copied. Paste it over index.html, then deploy that file.", 7000);
  } catch {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "index.html";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Clipboard was blocked, so index.html was downloaded instead.", 7000);
  }
}

function init() {
  try {
    applyState();
    assignIds(document);
    document.querySelectorAll(".grid > .card").forEach(wrapCard);
    document.querySelectorAll(".section").forEach(decorateSection);
    document.querySelectorAll(".grid").forEach(bindGrid);
    bindSections();
    renumber();
  } finally {
    document.documentElement.classList.remove("layout-pending");
  }
  filterBookmarks();
  filterInput?.focus();
  window.addEventListener("resize", () => {
    document.querySelectorAll(".slot").forEach((slot) => slot._syncSize?.());
  });
}

filterInput?.addEventListener("input", filterBookmarks);
filterInput?.addEventListener("search", filterBookmarks);
filterInput?.addEventListener("change", filterBookmarks);

function isTypingTarget(el) {
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest?.("dialog[open]"));
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "q" && event.key !== "Q") return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (isTypingTarget(event.target)) return;
  event.preventDefault();
  filterInput?.focus();
  filterInput?.select();
});

document.querySelector("#toggle-edit")?.addEventListener("click", () => {
  setEditMode(!isEditMode());
});
document.querySelector("#add-bookmark")?.addEventListener("click", () => openBookmarkDialog(null));
document.querySelector("#add-section")?.addEventListener("click", () => openSectionDialog(null));
document.querySelector("#copy-html")?.addEventListener("click", () => {
  copyHTML();
});
document.querySelector("#reset-layout")?.addEventListener("click", () => {
  if (!localStorage.getItem(STORAGE_KEY)) {
    setStatus("Nothing saved in this browser.");
    return;
  }
  if (!window.confirm("Forget the order and bookmarks saved in this browser? The file itself stays as it is.")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});
document.querySelector("#editor-help")?.addEventListener("click", () => {
  helpDialog?.showModal();
});
document.querySelector("#help-close")?.addEventListener("click", () => helpDialog?.close());
document.querySelector("#bookmark-form")?.addEventListener("submit", saveBookmark);
document.querySelector("#bookmark-cancel")?.addEventListener("click", () => bookmarkDialog.close());
document.querySelector("#bookmark-section")?.addEventListener("change", toggleNewSectionFields);
document.querySelector("#section-form")?.addEventListener("submit", saveSection);
document.querySelector("#section-cancel")?.addEventListener("click", () => sectionDialog.close());
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

init();
