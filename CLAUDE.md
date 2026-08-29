# CLAUDE.md

All agent instructions for this repository live in **[AGENTS.md](./AGENTS.md)**.

Read that file before making changes. Do not duplicate guidance here — keep
`AGENTS.md` as the single source of truth so every agent tool sees the same
instructions.

Two things that cause the most damage if missed (full detail in `AGENTS.md`):

1. **This repo is a fork** of `chadbyte/clay-chrome`. `main` is a clean upstream
   mirror — never commit to it. Work on the `bojan` branch.
2. **Run tests with `node --test test/*.test.js`** (glob form; `node --test test/`
   is broken on Node 26).
