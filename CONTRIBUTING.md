# Contributing to SignalScope

Thank you for helping improve SignalScope.

## Before opening a change

For behavior changes, open an issue describing the user problem, expected result, and a representative audio condition. Security reports should follow [SECURITY.md](./SECURITY.md) instead of public issue discussion.

## Local setup

```powershell
bun install
bun run check
bun run dev
```

## Pull-request expectations

- Keep changes focused and explain the user or maintainer impact.
- Include tests for new detection behavior and failure boundaries.
- Preserve local-only processing and the claims documented in the README.
- Update architecture or privacy documentation when a data flow changes.
- Do not commit source recordings unless they are original, redistributable, minimal, and necessary.
- Confirm `bun run check` passes.

By contributing, you agree that your contribution may be distributed under the MIT License.
