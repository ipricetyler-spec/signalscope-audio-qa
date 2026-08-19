import { describe, expect, test } from "bun:test";
import { analyzeAudio, createDemoAudio } from "./audioAnalysis.ts";

describe("analyzeAudio", () => {
  test("calculates clean stereo metrics", () => {
    const left = new Float32Array([0.5, -0.5, 0.5, -0.5]);
    const right = new Float32Array(left);
    const report = analyzeAudio([left, right], 4, "2026-01-01T00:00:00.000Z");
    expect(report.metrics.peak).toBe(0.5);
    expect(report.metrics.rms).toBe(0.5);
    expect(report.metrics.balanceDb).toBeCloseTo(0, 6);
    expect(report.metrics.stereoCorrelation).toBeCloseTo(1, 6);
    expect(report.qualityScore).toBe(100);
  });

  test("detects clipping, silence, and imbalance in demo audio", () => {
    const report = analyzeAudio(createDemoAudio(1000), 1000);
    expect(report.findings.some((finding) => finding.type === "clipping")).toBe(true);
    expect(report.findings.some((finding) => finding.type === "silence")).toBe(true);
    expect(report.findings.some((finding) => finding.type === "imbalance")).toBe(true);
    expect(report.qualityScore).toBeLessThan(100);
    expect(report.waveform.length).toBe(700);
  });

  test("reports mono input as informational", () => {
    const report = analyzeAudio([new Float32Array([0.1, -0.1])], 2);
    expect(report.metrics.balanceDb).toBeNull();
    expect(report.findings[0]?.type).toBe("channel-layout");
  });

  test("rejects invalid audio buffers", () => {
    expect(() => analyzeAudio([], 48_000)).toThrow(RangeError);
    expect(() => analyzeAudio([[0], [0, 1]], 48_000)).toThrow(RangeError);
    expect(() => analyzeAudio([[Number.NaN]], 48_000)).toThrow(TypeError);
  });
});
