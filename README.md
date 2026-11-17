# KERI bookmarks

A static field guide to [Key Event Receipt Infrastructure](https://keri.foundation/) (KERI): search tools, visualisations, websites, tutorials, specifications, videos, meetings, and working documents.

Open `index.html` in a browser. There is no build step. The page reads the bookmark list from `bookmarks.js`.

## Add a bookmark

Edit the JSON object in `bookmarks.js`. Each section has an `id`, `title`, `description`, and a `bookmarks` array.

```json
{
  "title": "Example",
  "url": "https://example.com/",
  "description": "Short description.",
  "keywords": "words the filter should match"
}
```

Optional fields:

- `badge` — a short label, such as `GPT` or `Sheet`
- `repo` — a second link, shown as “GitHub repository”

`keywords` is what the header filter searches, along with the title, description, and host. The header links are built from the sections, so a new section appears in the nav on its own.

## Files

- `index.html` — page shell
- `bookmarks.js` — the bookmark list, as one JSON object
- `styles.css` — layout, aligned with [keri.foundation](https://keri.foundation/)
- `script.js` — renders the list and filters it
- `logo.png` — KERI Foundation logo
- `favicon.svg` — site icon
