# SignalScope maintainer instructions

## Product invariants

- Audio files and derived samples stay in the browser. Do not add uploads, telemetry, third-party fonts, tracking, or remote analysis without an explicit product/privacy decision.
- Describe measurements precisely. RMS is not LUFS; threshold clipping is not inter-sample peak detection; the quality score is a deterministic triage aid, not certification.
- Keep the signal engine independent from the DOM so its behavior remains directly testable.
- Treat filenames and future user-provided metadata as untrusted text. Do not inject them with `innerHTML`.
- Preserve keyboard navigation, semantic structure, status announcements, reduced-motion support, and responsive layouts.

## Development workflow

- Use Bun; do not add `package-lock.json` or migrate scripts to npm.
- Run `bun run check` before proposing a change.
- Add boundary or counterexample tests for every detection-rule change.
- Document threshold or score changes in `ARCHITECTURE.md` and `CHANGELOG.md`.
- Keep generated files (`node_modules`, `dist`, Playwright artifacts) out of commits.

## Release workflow

1. Update `CHANGELOG.md`.
2. Run `bun install --frozen-lockfile` and `bun run check`.
3. Exercise the demo, a clean stereo buffer, mono input, and report downloads.
4. Confirm the privacy scan finds no unexpected network APIs or third-party URLs.
5. Tag releases with semantic versions.
