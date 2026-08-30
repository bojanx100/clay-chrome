# End-to-end fixture

`live-ui-highlight.e2e.html` exercises the Live UI worker-highlight path in a
**real browser against the real modules** — no jsdom, no mocks, no build step
and no npm dependency. It loads `live-ui-target-context.js`,
`live-ui-target-ui.js` and `live-ui-target-reports.js` directly by relative
path, so it fails the moment those files regress.

It exists because the unit suite fakes `document`, `location` and
`getBoundingClientRect`. This fixture is the only place that proves:

- `selectorCandidates` really does fall back to an unanchored structural path
  (`div > main > section > div:nth-of-type(2) > span`) for an element with no
  id / test-id / name;
- that selector really does match a **different** element on another screen —
  the original reported bug, reproduced rather than assumed;
- the route gate really does suppress it after a real `history.pushState`;
- the outline is really positioned over the picked element (real layout).

## Why the shared-`#saveButton` case exists

Both screens render `<button id="saveButton">Save</button>`. That case looks
redundant but is the **only** check that isolates the route gate.

For the structural-selector case, tag+text verification already rejects the
stray match, so that assertion passes even with the route gate deleted — it
does not test what its name suggests. A shared component keeps the same id,
tag and text on both screens, and text is deliberately not verified for stable
selectors (so a worker's own HMR edit cannot erase its highlight). Tag and text
verification are both blind there; only the route gate suppresses it.

Verified by mutation: deleting `if (!matchesRoute(locator)) return null;` fails
exactly that one check, and reverting `refreshHighlights` to the old
always-outline behavior fails four.

## Running it

It needs `http://`, not `file://` — `history.pushState` throws a
`SecurityError` on `file://`.

```sh
python3 -m http.server 8731          # from the repo root
open http://127.0.0.1:8731/test/e2e/live-ui-highlight.e2e.html
```

Every check and its result renders on the page. Green `PASS` for all rows means
the suite passed. For automation, the same data is on
`window.__clayE2E` as `{ done, results: [{name, pass, detail}], failed }` —
`failed === 0` is the pass condition.

## Scope

This covers the target-page half of the feature (locator resolution and
highlight visibility). It does **not** cover the DevTools panel toggle or the
`report.showAll` message hop through the service worker — those are unit-tested
in `test/live-ui-show-all-workers.test.js`, since driving them requires loading
the unpacked extension and a paired Clay session.
