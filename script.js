const input = document.querySelector("#filter");
const empty = document.querySelector("#empty");
const sections = document.querySelectorAll(".section");
const cards = document.querySelectorAll("[data-bookmark]");

function normalize(value) {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function filter() {
  const query = normalize(input.value.trim());
  let visible = 0;

  cards.forEach((card) => {
    const haystack = normalize(card.getAttribute("data-bookmark"));
    const match = query === "" || haystack.includes(query);
    card.classList.toggle("hidden-section", !match);
    if (match) visible += 1;
  });

  sections.forEach((section) => {
    const any = section.querySelector("[data-bookmark]:not(.hidden-section)");
    section.classList.toggle("hidden-section", Boolean(query) && !any);
  });

  empty.hidden = visible !== 0;
}

input?.addEventListener("input", filter);
input?.addEventListener("search", filter);
input?.addEventListener("change", filter);
