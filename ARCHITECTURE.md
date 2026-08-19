# SignalScope architecture

## System boundary

```text
User-selected audio file
        │
        ▼
Browser AudioContext decoder
        │  Float32 channel arrays
        ▼
Deterministic TypeScript analysis engine
        ├── global metrics
        ├── timestamped findings
        ├── quality score
        └── waveform buckets
                 │
                 ▼
Accessible dashboard + JSON/CSV export
```

All processing occurs inside the browser tab. The application has no network API, database, authentication, analytics, tracking pixel, or server-side upload route.

## Modules

- `src/audioAnalysis.ts` is a UI-independent analysis core. It validates buffers, calculates metrics, groups clipping samples into regions, locates silence intervals, assigns findings, and produces bounded waveform data.
- `src/main.ts` adapts browser-decoded `AudioBuffer` channels to the analysis core, renders accessible DOM output, draws the Canvas waveform, and creates downloads.
- `src/style.css` implements the responsive design system, keyboard focus treatment, reduced-motion behavior, and data-density layouts.
- `src/audioAnalysis.test.ts` verifies clean stereo calculations, synthetic defect detection, mono handling, and invalid-input failures.

## Detection rules

| Check | Rule | Output |
|---|---|---|
| Sample clipping | Absolute amplitude ≥ 0.99 | Timestamped critical region |
| Extended silence | Average absolute channel amplitude < 0.004 for ≥ 450 ms | Timestamped warning |
| Channel imbalance | Average left/right RMS differs by > 3 dB | Whole-file warning |
| DC offset | Absolute mean sample value > 0.02 | Whole-file warning |
| Mono layout | One decoded channel | Informational limitation |

The score begins at 100 and applies bounded deductions for detected categories. It is a triage aid, not an industry certification.

## Production roadmap

1. Add an AudioWorklet-based chunked analysis path for long files without large main-thread buffers.
2. Add integrated loudness using a tested BS.1770 implementation and label it separately from RMS.
3. Validate WebVTT caption timing and reading speed as an optional accessibility module.
4. Add downloadable HTML/PDF reports with branding controls.
5. Add Playwright accessibility regression checks using axe-core.
6. Benchmark memory and analysis time across representative codecs and file durations.
