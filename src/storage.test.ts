import { describe, expect, test } from "bun:test";
import { SOURCE_OPTIONS, STORAGE_KEY_FILTERS } from "./constants";
import { readSalaryBound, readStoredFilters } from "./storage";
import type { BoardFilters } from "./types";

const FALLBACK_FILTERS: BoardFilters = {
  keyword: "",
  sources: [],
  locations: [],
  workMode: "all",
  hidden: "active",
  salaryMin: null,
  salaryMax: null,
};

function withMemoryStorage<T>(run: () => T): T {
  const store = new Map<string, string>();
  const globalRef = globalThis as { localStorage?: unknown };
  const originalStorage = globalRef.localStorage;
  globalRef.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  try {
    return run();
  } finally {
    globalRef.localStorage = originalStorage;
  }
}

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

describe("readStoredFilters", () => {
  test("keeps every source option after a save and reload", () => {
    withMemoryStorage(() => {
      const savedFilters: BoardFilters = { ...FALLBACK_FILTERS, sources: [...SOURCE_OPTIONS] };
      localStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(savedFilters));
      expect(readStoredFilters(FALLBACK_FILTERS).sources).toEqual(SOURCE_OPTIONS);
    });
  });

  test("drops source ids that are not known sources", () => {
    withMemoryStorage(() => {
      localStorage.setItem(
        STORAGE_KEY_FILTERS,
        JSON.stringify({ ...FALLBACK_FILTERS, sources: ["publicjobs", "not-a-source"] }),
      );
      expect(readStoredFilters(FALLBACK_FILTERS).sources).toEqual(["publicjobs"]);
    });
  });

  test("falls back to the provided filters when storage is empty", () => {
    withMemoryStorage(() => {
      expect(readStoredFilters(FALLBACK_FILTERS)).toEqual(FALLBACK_FILTERS);
    });
  });
});
