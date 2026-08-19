# SignalScope — browser audio QA workbench

## Project summary

SignalScope is a TypeScript application that performs deterministic audio quality screening entirely inside the browser. Users can drop in a recording, inspect a waveform and technical metrics, review timestamped defects, and export the results as JSON or CSV.

## The problem

Media teams often discover clipping, silent gaps, or channel problems late in delivery. Many browser tools also require the source recording to be uploaded before analysis, which can be unsuitable for private client media.

## The solution

I built a local-only analysis pipeline using the Web Audio API, a UI-independent TypeScript DSP module, and Canvas visualization. The analyzer reports peak/RMS levels, crest factor, DC offset, channel balance, stereo correlation, clipping regions, and extended silence. An engineered demo signal makes every major workflow immediately testable.

## Engineering decisions

- Kept detection deterministic and documented instead of presenting heuristic output as AI certainty.
- Separated the signal engine from browser rendering so the math can be unit tested.
- Reduced waveform data into bounded buckets rather than retaining display-resolution assumptions in the analysis core.
- Used DOM construction for report rows rather than injecting untrusted filenames or findings through HTML.
- Kept the privacy promise structural: there is no upload endpoint, database, or telemetry.
- Explicitly distinguished RMS from standards-based LUFS measurement.

## Verified result

- Automated tests cover clean stereo metrics, synthetic defect detection, mono input, and invalid buffers.
- Strict TypeScript checking and a production Vite build are included in the `check` command.
- The interface supports drag-and-drop, keyboard navigation, semantic report tables, status announcements, responsive layouts, and reduced-motion preferences.

## Stack

TypeScript, Web Audio API, Canvas 2D, semantic HTML, CSS, Bun test, and Vite.

## Possible client applications

Podcast preflight, e-learning media QA, call-recording inspection, creator upload checks, browser media tooling, and accessibility-oriented caption/audio workflows.

## Honest limitations

This prototype does not claim calibrated loudness compliance, inter-sample peak detection, codec-independent decoding, or perceptual quality evaluation. Those capabilities are documented as future work rather than implied by the current interface.
