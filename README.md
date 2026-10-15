# KERI bookmarks

A static field guide to [Key Event Receipt Infrastructure](https://keri.foundation/) (KERI): search tools, visualisations, websites, tutorials, specifications, conference videos, meetings, and working documents.

Open `index.html` in a browser. There is no build step.

## Sections

| Section | What it collects |
| --- | --- |
| Search | Term lookup, the KERI suite search engine, and GitHub search |
| Visualisation | Value-system graph and term visualiser |
| Websites | Foundation and conference sites |
| Education | Learning hub and concept cards |
| Tutorials | Narrative walkthroughs and jargon guides |
| Specifications | KSWG specs (ACDC, KERI, CESR) and ToIP glossaries published with Spec-Up-T |
| Conference videos | KERICONF and SEDI talk galleries and playlists |
| KERI Wizard | A custom GPT for questions about the suite |
| Meetings | Trust over IP calendar on the Linux Foundation LFX platform |
| Google Docs | Spreadsheet behind the value-system graph |
| Temporary | Working copies and review builds that may move or be replaced |

The header filter matches text in each card’s `data-bookmark` attribute and hides sections that have no matches.

## Add a bookmark

Add a card inside the matching `<section class="section">` in `index.html`:

```html
<a class="card" data-bookmark="keywords used by the filter"
  href="https://example.com/" target="_blank" rel="noopener noreferrer">
  <div class="card-art" aria-hidden="true">
    <!-- optional illustration -->
  </div>
  <div class="card-body">
    <h3>Title</h3>
    <p>Short description.</p>
    <span class="host">example.com</span>
  </div>
</a>
```

Put words people might type into `data-bookmark` (title, acronyms, host). The visible title and description are not searched.

## Files

- `index.html` — page and bookmark cards
- `styles.css` — layout and illustration styles
- `script.js` — filter
- `favicon.svg` — site icon
