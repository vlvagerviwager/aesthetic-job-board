import { describe, expect, test } from "bun:test";
import { detectWorkMode, workModeLabel } from "./workMode";

describe("detectWorkMode", () => {
  test("detects remote from location", () => {
    expect(detectWorkMode("Remote", "Engineer", "Great role")).toBe("remote");
  });

  test("detects remote synonyms", () => {
    expect(detectWorkMode("Dublin", "Engineer", "work from home two days")).toBe("remote");
  });

  test("hybrid wins over remote", () => {
    expect(detectWorkMode("Hybrid remote", "Engineer", "")).toBe("hybrid");
  });

  test("defaults to onsite", () => {
    expect(detectWorkMode("Cork", "Nurse", "Hospital role")).toBe("onsite");
  });
});

describe("workModeLabel", () => {
  test("labels all modes", () => {
    expect(workModeLabel("remote")).toBe("Remote");
    expect(workModeLabel("hybrid")).toBe("Hybrid");
    expect(workModeLabel("onsite")).toBe("On site");
  });
});
