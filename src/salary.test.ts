import { describe, expect, test } from "bun:test";
import { matchesSalaryRange, parseSalaryRange } from "./salary";

describe("parseSalaryRange", () => {
  test("parses a single annual figure", () => {
    expect(parseSalaryRange("Salary: €40,851")).toEqual({ low: 40851, high: 40851 });
  });

  test("parses an annual range", () => {
    expect(parseSalaryRange("Salary: €35,000–€38,000 per annum")).toEqual({
      low: 35000,
      high: 38000,
    });
  });

  test("expands K shorthand ranges", () => {
    expect(parseSalaryRange("Salary range circa €36-43K")).toEqual({ low: 36000, high: 43000 });
  });

  test("annualises hourly rates full time", () => {
    expect(parseSalaryRange("Salary: €18.54 - €23.45 per hour")).toEqual({
      low: Math.round(18.54 * 2080),
      high: Math.round(23.45 * 2080),
    });
  });

  test("parses bare scale figures in scale context", () => {
    expect(parseSalaryRange("Salary Scale: Youth Worker Pay Scale: 39,661 – 58,157")).toEqual({
      low: 39661,
      high: 58157,
    });
  });

  test("ignores small bare numbers like hours and percentages", () => {
    expect(parseSalaryRange("Salary: €60,000 per annum pro rata for 22.5 hours")).toEqual({
      low: 60000,
      high: 60000,
    });
  });

  test("returns null when no figures exist", () => {
    expect(parseSalaryRange("Salary: Commensurate with experience")).toBeNull();
    expect(parseSalaryRange("Salary in line with the organisation salary scale.")).toBeNull();
    expect(parseSalaryRange("")).toBeNull();
  });
});

describe("matchesSalaryRange", () => {
  test("matches everything when no bounds set", () => {
    expect(matchesSalaryRange("no figures here", null, null)).toBe(true);
  });

  test("excludes unparseable salaries when bounds set", () => {
    expect(matchesSalaryRange("Commensurate with experience", 30000, null)).toBe(false);
  });

  test("matches on overlap with the minimum", () => {
    expect(matchesSalaryRange("Salary: €35,000–€38,000 per annum", 36000, null)).toBe(true);
    expect(matchesSalaryRange("Salary: €35,000–€38,000 per annum", 39000, null)).toBe(false);
  });

  test("matches on overlap with the maximum", () => {
    expect(matchesSalaryRange("Salary: €35,000–€38,000 per annum", null, 36000)).toBe(true);
    expect(matchesSalaryRange("Salary: €35,000–€38,000 per annum", null, 34000)).toBe(false);
  });

  test("matches inside a bounded range", () => {
    expect(matchesSalaryRange("Salary: €40,851", 30000, 50000)).toBe(true);
    expect(matchesSalaryRange("Salary: €40,851", 41000, 50000)).toBe(false);
  });
});
