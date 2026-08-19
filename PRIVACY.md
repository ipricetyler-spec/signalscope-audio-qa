# Privacy model

SignalScope is local-first by construction:

- The selected audio file is read by the browser and decoded with `AudioContext`.
- Sample buffers remain in the current page's memory.
- Reports are generated as browser downloads.
- No audio, filename, measurement, or report data is transmitted.
- No cookies, local storage, analytics, telemetry, account, or backend is used.

Closing or reloading the tab releases the active in-memory report. A future hosted deployment must preserve this boundary or update its privacy documentation and obtain explicit consent before transmitting any file or metadata.
