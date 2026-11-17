const filterInput = document.querySelector("#filter");
const empty = document.querySelector("#empty");
const main = document.querySelector("#main");
const nav = document.querySelector("#nav");

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalize(value) {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

function haystack(bookmark, host) {
  return [bookmark.title, bookmark.description, bookmark.keywords, bookmark.badge, host]
    .filter(Boolean)
    .join(" ");
}

function renderCard(bookmark) {
  const host = hostname(bookmark.url);
  const meta = el("p", { class: "meta" }, el("span", { class: "host", text: host }));
  if (bookmark.badge) meta.prepend(el("span", { class: "badge", text: bookmark.badge }));

  const mainLink = el(
    "a",
    {
      class: "card-main",
      href: bookmark.url,
      target: "_blank",
      rel: "noopener noreferrer",
    },
    el(
      "div",
      { class: "kicker" },
      el("h3", { text: bookmark.title }),
      meta
    ),
    bookmark.description ? el("p", { class: "summary", text: bookmark.description }) : null
  );

  const card = el(
    "article",
    { class: "card", "data-bookmark": haystack(bookmark, host) },
    mainLink
  );

  if (bookmark.repo) {
    card.append(
      el("a", {
        class: "repo-link",
        href: bookmark.repo,
        target: "_blank",
        rel: "noopener noreferrer",
        text: "GitHub repository",
      })
    );
  }

  return card;
}

let sectionObserver;

function watchSections() {
  if (sectionObserver) sectionObserver.disconnect();
  const links = new Map(
    [...nav.querySelectorAll("a")].map((link) => [link.getAttribute("href").slice(1), link])
  );
  sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting && !entry.target.hidden)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      for (const link of links.values()) link.removeAttribute("aria-current");
      links.get(visible.target.id)?.setAttribute("aria-current", "true");
    },
    { rootMargin: "-25% 0px -55% 0px", threshold: [0.15, 0.4] }
  );
  for (const section of document.querySelectorAll(".section")) sectionObserver.observe(section);
}

function render(data) {
  if (data.title) document.title = data.title;
  const heading = document.querySelector("#page-title");
  if (heading && data.title) {
    heading.replaceChildren(
      el("span", { class: "rule", "aria-hidden": "true" }),
      document.createTextNode(data.title),
      el("span", { class: "rule", "aria-hidden": "true" })
    );
  }
  const lede = document.querySelector("#lede");
  if (lede && data.lede) lede.textContent = data.lede;

  nav.replaceChildren();
  for (const section of main.querySelectorAll(".section")) section.remove();

  for (const section of data.sections) {
    nav.append(el("a", { href: `#${section.id}`, text: section.title }));
    main.append(
      el(
        "section",
        { class: "section", id: section.id },
        el(
          "header",
          { class: "section-head" },
          el("h2", { text: section.title }),
          section.description ? el("p", { text: section.description }) : null
        ),
        el("div", { class: "grid" }, ...section.bookmarks.map(renderCard))
      )
    );
  }

  watchSections();
}

function applyFilter() {
  const query = normalize(filterInput.value.trim());
  let shown = 0;
  for (const section of document.querySelectorAll(".section")) {
    let matches = 0;
    for (const card of section.querySelectorAll(".card")) {
      const match = !query || normalize(card.dataset.bookmark || "").includes(query);
      card.hidden = !match;
      if (match) matches += 1;
    }
    section.hidden = matches === 0;
    shown += matches;
    const link = nav.querySelector(`a[href="#${section.id}"]`);
    if (link) link.hidden = matches === 0;
  }
  empty.hidden = shown !== 0;
  markCurrent();
}

function markCurrent() {
  for (const link of nav.querySelectorAll("a")) link.removeAttribute("aria-current");
  if (filterInput.value.trim()) return;
  const line = window.innerHeight * 0.28;
  let current = null;
  for (const section of document.querySelectorAll(".section")) {
    if (section.hidden) continue;
    if (section.getBoundingClientRect().top <= line) current = section;
  }
  if (!current) current = document.querySelector(".section:not([hidden])");
  if (current) nav.querySelector(`a[href="#${current.id}"]`)?.setAttribute("aria-current", "true");
}

filterInput.addEventListener("input", applyFilter);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.activeElement === filterInput) {
    filterInput.value = "";
    applyFilter();
    filterInput.blur();
    return;
  }
  if (event.key !== "q" || event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) return;
  event.preventDefault();
  filterInput.focus();
  filterInput.select();
});

if (!window.BOOKMARKS || !Array.isArray(window.BOOKMARKS.sections)) {
  empty.hidden = false;
  empty.textContent = "Bookmarks could not be loaded.";
} else {
  render(window.BOOKMARKS);
}
