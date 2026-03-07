import { describe, it, expect } from "vitest";
import { cn, formatBytes, formatDuration, randomSeed } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("deduplicates tailwind classes", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });
});

describe("formatBytes", () => {
  it("formats zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats KB", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });

  it("formats GB", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
  });
});

describe("formatDuration", () => {
  it("formats sub-second", () => {
    expect(formatDuration(0.5)).toBe("<1s");
  });

  it("formats seconds", () => {
    expect(formatDuration(15)).toBe("15s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1m 30s");
  });
});

describe("randomSeed", () => {
  it("returns a positive integer", () => {
    const seed = randomSeed();
    expect(seed).toBeGreaterThan(0);
    expect(Number.isInteger(seed)).toBe(true);
  });
});
