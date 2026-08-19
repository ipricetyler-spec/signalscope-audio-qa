import "./style.css";
import { analyzeAudio, createDemoAudio, type AudioFinding, type AudioReport } from "./audioAnalysis.ts";

interface SourceInfo { name: string; sizeBytes: number | null; kind: "file" | "demo" }

let activeReport: AudioReport | null = null;
let activeSource: SourceInfo = { name: "Engineered defect demo", sizeBytes: null, kind: "demo" };

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
}

function amplitudeDb(value: number): string {
  if (value <= 1e-12) return "−∞ dBFS";
  return `${(20 * Math.log10(value)).toFixed(1)} dBFS`;
}

function timecode(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function fileSize(bytes: number): string {
  return bytes < 1_000_000 ? `${(bytes / 1000).toFixed(0)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Healthy signal";
  if (score >= 70) return "Review recommended";
  return "Corrections needed";
}

function createCell(text: string): HTMLTableCellElement {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function renderFinding(finding: AudioFinding): HTMLTableRowElement {
  const row = document.createElement("tr");
  const severity = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `severity ${finding.severity}`;
  badge.textContent = finding.severity;
  severity.append(badge);
  row.append(severity, createCell(timecode(finding.startSeconds)));
  const title = document.createElement("td");
  const strong = document.createElement("strong");
  strong.textContent = finding.title;
  title.append(strong);
  row.append(title, createCell(finding.detail));
  return row;
}

function drawWaveform(report: AudioReport): void {
  const canvas = element<HTMLCanvasElement>("waveform");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.round(240 * ratio);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(ratio, ratio);
  const width = rect.width;
  const height = 240;
  context.clearRect(0, 0, width, height);

  context.strokeStyle = "#253541";
  context.lineWidth = 1;
  for (let line = 1; line < 4; line += 1) {
    const y = line * height / 4;
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }

  context.fillStyle = "rgba(87, 230, 188, .22)";
  context.strokeStyle = "#58e6bd";
  context.lineWidth = 1.25;
  context.beginPath();
  report.waveform.forEach((bucket, index) => {
    const x = index * width / Math.max(1, report.waveform.length - 1);
    const y = height / 2 - bucket.max * height * 0.43;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  for (let index = report.waveform.length - 1; index >= 0; index -= 1) {
    const bucket = report.waveform[index];
    if (!bucket) continue;
    const x = index * width / Math.max(1, report.waveform.length - 1);
    context.lineTo(x, height / 2 - bucket.min * height * 0.43);
  }
  context.closePath(); context.fill(); context.stroke();

  for (const finding of report.findings) {
    if (finding.type === "imbalance" || finding.type === "dc-offset" || finding.type === "channel-layout") continue;
    const x = finding.startSeconds / report.metrics.durationSeconds * width;
    const markerWidth = Math.max(3, finding.durationSeconds / report.metrics.durationSeconds * width);
    context.fillStyle = finding.severity === "critical" ? "rgba(255, 98, 98, .68)" : "rgba(255, 191, 91, .5)";
    context.fillRect(x, 0, markerWidth, height);
  }
}

function render(report: AudioReport, source: SourceInfo): void {
  activeReport = report;
  activeSource = source;
  const metrics = report.metrics;
  element("quality-score").textContent = String(report.qualityScore);
  element("score-label").textContent = scoreLabel(report.qualityScore);
  element<HTMLElement>("score-ring").style.setProperty("--score", String(report.qualityScore));
  element("file-summary").textContent = source.sizeBytes === null
    ? `${source.name} · ${metrics.channelCount} channels`
    : `${source.name} · ${fileSize(source.sizeBytes)} · ${metrics.channelCount} channels`;
  element("duration").textContent = timecode(metrics.durationSeconds);
  element("sample-rate").textContent = `${(metrics.sampleRate / 1000).toFixed(1)} kHz · ${metrics.channelCount === 1 ? "mono" : "stereo"}`;
  element("peak").textContent = amplitudeDb(metrics.peak);
  element("clip-count").textContent = `${metrics.clippedSamples.toLocaleString()} clipped samples`;
  element("rms").textContent = amplitudeDb(metrics.rms);
  element("crest-factor").textContent = `${metrics.crestFactorDb.toFixed(1)} dB crest factor`;
  element("balance").textContent = metrics.balanceDb === null ? "N/A" : `${metrics.balanceDb >= 0 ? "+" : ""}${metrics.balanceDb.toFixed(1)} dB`;
  element("correlation").textContent = metrics.stereoCorrelation === null ? "Mono source" : `${metrics.stereoCorrelation.toFixed(2)} correlation`;
  element("mid-time").textContent = timecode(metrics.durationSeconds / 2);
  element("end-time").textContent = timecode(metrics.durationSeconds);

  const body = element<HTMLTableSectionElement>("findings-body");
  body.replaceChildren(...report.findings.map(renderFinding));
  element("finding-count").textContent = `${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}`;
  element<HTMLElement>("no-findings").hidden = report.findings.length !== 0;
  element<HTMLElement>("status").textContent = `${source.name} analyzed locally. ${report.findings.length} findings generated.`;
  drawWaveform(report);
}

async function decodeFile(file: File): Promise<void> {
  element("status").textContent = `Decoding ${file.name}…`;
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    render(analyzeAudio(channels, buffer.sampleRate), { name: file.name, sizeBytes: file.size, kind: "file" });
  } finally {
    await context.close();
  }
}

function loadFile(file: File): void {
  void decodeFile(file).catch((error: unknown) => {
    element("status").textContent = error instanceof Error ? `Could not analyze file: ${error.message}` : "Could not analyze this file.";
  });
}

function loadDemo(): void {
  render(analyzeAudio(createDemoAudio(), 48_000), { name: "Engineered defect demo", sizeBytes: null, kind: "demo" });
}

function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

function reportPayload(): object | null {
  if (!activeReport) return null;
  const { waveform: _waveform, ...portableReport } = activeReport;
  return { product: "SignalScope", source: activeSource, ...portableReport };
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

element<HTMLInputElement>("audio-file").addEventListener("change", (event) => {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (file) loadFile(file);
});
element("load-demo").addEventListener("click", loadDemo);

const dropZone = element<HTMLElement>("drop-zone");
for (const eventName of ["dragenter", "dragover"]) dropZone.addEventListener(eventName, (event) => {
  event.preventDefault(); dropZone.classList.add("dragging");
});
for (const eventName of ["dragleave", "drop"]) dropZone.addEventListener(eventName, (event) => {
  event.preventDefault(); dropZone.classList.remove("dragging");
});
dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files[0];
  if (file) loadFile(file);
});

element("export-json").addEventListener("click", () => {
  const payload = reportPayload();
  if (payload) download("signalscope-report.json", JSON.stringify(payload, null, 2), "application/json");
});
element("export-csv").addEventListener("click", () => {
  if (!activeReport) return;
  const header = ["severity", "time_seconds", "duration_seconds", "type", "finding", "detail"];
  const rows = activeReport.findings.map((finding) => [finding.severity, finding.startSeconds.toFixed(3), finding.durationSeconds.toFixed(3), finding.type, finding.title, finding.detail]);
  download("signalscope-findings.csv", [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n"), "text/csv");
});

let resizeTimer = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => { if (activeReport) drawWaveform(activeReport); }, 100);
});

loadDemo();
