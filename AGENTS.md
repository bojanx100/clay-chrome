# AGENTS.md

Instructions for AI coding agents working in this repository. This is the
canonical agent instruction file; `CLAUDE.md` points here.

## 1. This repo is a FORK — read this before touching branches

`bojanx100/clay-chrome` is a **fork** of `chadbyte/clay-chrome`. Verify before
assuming otherwise:

```sh
gh api repos/bojanx100/clay-chrome --jq '{fork:.fork, parent:.parent.full_name}'
# => {"fork":true,"parent":"chadbyte/clay-chrome"}
```

Do **not** conclude this is a standalone personal repo just because a single
person commits to it. That assumption has already caused one branch
restructure that had to be reverted.

### Branch model

| Branch | Role | Rule |
| --- | --- | --- |
| `main` | Clean mirror of `upstream/main` | **Never commit here.** It must stay byte-identical to `chadbyte/clay-chrome@main` so fork-sync stays trivial. |
| `bojan` | All local work | Default working branch. Commit and push here. |

Remotes:

```
origin    https://github.com/bojanx100/clay-chrome.git   (your fork)
upstream  https://github.com/chadbyte/clay-chrome.git    (source repo)
```

Keeping the mirror current:

```sh
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push origin main
```

If a fast-forward on `main` is ever refused, something has been committed to
`main` by mistake — stop and ask rather than force-pushing over it.

### Adopting upstream changes — cherry-pick, do NOT rebase

`bojan` has superseded upstream. Adoption is **selective**: take the upstream
commits that make sense, ignore the rest.

```sh
git fetch upstream -q
git log --oneline main..upstream/main     # what's new; empty = nothing to do
git show <sha>                            # read it before taking it
git checkout bojan && git cherry-pick <sha>
```

**Do not `git rebase bojan` onto `main`.** Rebasing takes every upstream commit
by construction — it cannot be selective, and it rewrites all 39+ local commits.
Cherry-pick is the permanent strategy here; mixing the two produces
duplicate-commit conflicts later. If a cherry-pick conflicts, resolve in favor
of the local implementation unless the upstream change is specifically the
thing being adopted.

Conflict surface is small. Only five files exist in both trees:

| File | Local divergence |
| --- | --- |
| `background.js` | heavy (~364 lines) |
| `inject.js` | ~105 lines |
| `content.js` | ~67 lines |
| `popup.html` | ~38 lines |
| `manifest.json` | ~3 lines |

Everything else (`devtools-*`, `live-ui-*`, all of `test/`) is local-only and
can never conflict with upstream.

### Known intentional divergences from upstream

Do not "restore" these — they are deliberate, and re-adopting the upstream
version would break Live UI:

- **`broadcastTabList` tab filter.** Upstream excludes *every* Clay tab
  globally via `isClayTab` / `isClayUrl` / `CLAY_URL_PATTERNS`. `bojan` replaced
  that with an `/^https?:\/\//i` scheme filter in `a8034a5` (feat: add Live UI
  browser overlay), because Live UI must be able to see and reuse an existing
  Clay tab.

  Self-exclusion was not dropped, it was made **per-port**: each port is sent
  `allTabs.filter(tab.id !== ownTabId)`, so a Clay tab still never sees itself,
  but it does see other Clay tabs. Side effect of the scheme filter:
  `chrome://`, `file://`, and `about:` tabs are no longer listed — intended,
  since the extension cannot script or capture them anyway.

  Locked down by `test/tab-list-broadcast.test.js`. Both behaviors are
  mutation-checked: reverting to a global Clay exclusion fails 3 tests, and
  removing the per-port self-exclusion fails 1.

### Upstream status

As of 2026-08-29 upstream is dormant: last push 2026-04-18, single `main`
branch, and **zero commits that `bojan` does not already contain**. Verify
before assuming there is anything to adopt.

## 2. Commit identity

This repo has a **local** git identity override, because the repo was
transferred between two distinct GitHub accounts (`bojantv`, id 58706872 →
`bojanx100`, id 291598829). They are different accounts, not a rename.

```
user.name  = bojanx100
user.email = 291598829+bojanx100@users.noreply.github.com
```

Do not remove this override — without it, commits fall back to the global
identity and are misattributed on GitHub. Commits before 2026-08-29 are
authored as `bojantv` and are expected to stay that way.

## 3. Tests

No `package.json`, no test framework dependency. Tests use the built-in Node
test runner (`node:test` + `node:assert`) and CommonJS `require`.

```sh
node --test test/*.test.js      # 76 tests
```

Use the **glob** form. `node --test test/` misbehaves on Node 26 and reports a
single spurious failure. Run the suite before pushing; it is fast (<1s) and has
no external dependencies or network access.

## 4. Code conventions

Match the existing style exactly — it is deliberately conservative:

- **`var` only.** The codebase has ~1140 `var`, 0 `const`, 1 `let`. Do not
  modernize to `const`/`let`.
- **`function` expressions**, not arrow functions.
- **Dual export pattern.** Modules must work both as extension scripts (browser
  global) and under `require` in tests:

  ```js
  (function (root) {
    // ...
    root.ClayLiveUiEvidence = { captureDiagnostics: captureDiagnostics };
    if (typeof module !== "undefined" && module.exports) {
      module.exports = root.ClayLiveUiEvidence;
    }
  })(typeof globalThis !== "undefined" ? globalThis : this);
  ```

- No build step, no bundler, no transpile. Files ship to Chrome as written.
- No runtime dependencies. Keep it that way.

## 5. Architecture

Manifest V3 Chrome extension (`manifest.json`, name "Clay").

The extension **never talks to the Clay server directly.** It piggybacks on an
already-open Clay web page via a long-lived content-script port:

```
Clay Server <--WebSocket--> Clay Page <--postMessage--> content.js
    <--runtime port--> background.js <--scripting/debugger--> Target Tab
```

Key files:

| File | Role |
| --- | --- |
| `background.js` | Service worker: tab tracking, command dispatch |
| `content.js` | Injected into Clay tabs; message bridge |
| `content-bridge-recovery.js` | Reinjects bridge after worker restart/extension reload |
| `inject.js` | Injected into target tabs; console/network capture |
| `devtools-panel.*`, `devtools-live-*` | Docked Live UI workspace |
| `live-ui-target*.js` | Event-isolated picker, HMR state, worker highlights |
| `live-ui-evidence.js` | Masked screenshots + bounded diagnostics |
| `live-ui-react-background.js` | Main-world React component/source inspection |

The service worker is **not persistent** — it is torn down and restarted by
Chrome. Most historical bugs in this repo are reconnection bugs: extension
reload, HMR, port invalidation, tab discard. When touching bridge or Live UI
code, preserve the recovery paths and their tests
(`content-bridge-recovery.test.js`, `live-ui-auto-recovery.test.js`).

## 6. Security invariants

Do not weaken these; they are load-bearing:

- The extension only executes commands originating from the authenticated Clay
  server.
- Live UI only accepts the exact server-authorized loopback origin and target
  tab.
- Cross-project attachment and unverified remote origins are rejected
  server-side.
- Screenshots in Live UI reports are masked; console/network evidence is
  bounded before relay.

## 7. Manual verification

There is no automated end-to-end harness. To verify extension behavior:

1. `chrome://extensions` → Developer mode → **Load unpacked** → this directory.
2. Reload the extension after changes (service worker does not hot-reload).
3. Keep a Clay tab open; open DevTools on a target page → **Clay** panel.

Note that reloading the extension is itself the trigger for the reconnection
paths described above — exercise it deliberately when changing bridge code.
