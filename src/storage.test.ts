import { describe, expect, test } from "bun:test";
import { readSalaryBound } from "./storage";

describe("readSalaryBound", () => {
  test("passes through valid numbers floored", () => {
    expect(readSalaryBound(35000.9, null)).toBe(35000);
  });

  test("treats empty input as no bound", () => {
    expect(readSalaryBound(null, 100)).toBeNull();
    expect(readSalaryBound(undefined, 100)).toBeNull();
    expect(readSalaryBound("", 100)).toBeNull();
  });

  test("coerces numeric strings", () => {
    expect(readSalaryBound("42000", null)).toBe(42000);
  });

  test("falls back on negative or non-numeric input", () => {
    expect(readSalaryBound(-5, 100)).toBe(100);
    expect(readSalaryBound("banana", null)).toBeNull();
    expect(readSalaryBound(Number.NaN, 100)).toBe(100);
  });
});
