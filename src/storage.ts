import {
  SOURCE_OPTIONS,
  STORAGE_KEY_FILTERS,
  STORAGE_KEY_HIDDEN_OVERRIDES,
  STORAGE_KEY_THEME,
  THEME_DARK,
  THEME_LIGHT,
} from "./constants";
import type { BoardFilters, SourceId } from "./types";

const THEME_QUERY = "(prefers-color-scheme: dark)";

export function readSalaryBound(rawValue: unknown, fallbackValue: number | null): number | null {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }
  const parsedValue = typeof rawValue === "number" ? rawValue : Number(rawValue);
  if (Number.isFinite(parsedValue) === false || parsedValue < 0) {
    return fallbackValue;
  }
  return Math.floor(parsedValue);
}

const WORK_MODE_FILTER_VALUES: string[] = ["all", "remote", "hybrid", "onsite"];
const HIDDEN_FILTER_VALUES: string[] = ["active", "all", "hidden"];

function readJsonFromStorage<T>(key: string, fallbackValue: T, normalise: (parsedValue: unknown) => T): T {
  try {
    const rawValue = localStorage.getItem(key);
    if (rawValue === null || rawValue === "") {
      return fallbackValue;
    }
    return normalise(JSON.parse(rawValue));
  } catch (error) {
    console.warn(`Could not read ${key}, using fallback.`, error);
    return fallbackValue;
  }
}

function writeJsonToStorage(key: string, value: unknown): void {
  writeTextToStorage(key, JSON.stringify(value));
}

function writeTextToStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`Could not persist ${key}.`, error);
  }
}

export function getInitialTheme(): string {
  const storedTheme = localStorage.getItem(STORAGE_KEY_THEME);
  if (storedTheme === THEME_DARK || storedTheme === THEME_LIGHT) {
    return storedTheme;
  }
  const prefersDark = window.matchMedia(THEME_QUERY).matches;
  return prefersDark ? THEME_DARK : THEME_LIGHT;
}

export function applyTheme(themeName: string): void {
  document.documentElement.dataset.theme = themeName;
  writeTextToStorage(STORAGE_KEY_THEME, themeName);
}

export function readHiddenOverrides(): Record<string, boolean> {
  return readJsonFromStorage<Record<string, boolean>>(STORAGE_KEY_HIDDEN_OVERRIDES, {}, (parsedValue) => {
    if (typeof parsedValue !== "object" || parsedValue === null || Array.isArray(parsedValue)) {
      return {};
    }
    const cleanedOverrides: Record<string, boolean> = {};
    for (const [overrideId, overrideValue] of Object.entries(parsedValue)) {
      if (typeof overrideValue === "boolean") {
        cleanedOverrides[overrideId] = overrideValue;
      }
    }
    return cleanedOverrides;
  });
}

export function writeHiddenOverrides(overrides: Record<string, boolean>): void {
  writeJsonToStorage(STORAGE_KEY_HIDDEN_OVERRIDES, overrides);
}

export function readStoredFilters(fallbackFilters: BoardFilters): BoardFilters {
  return readJsonFromStorage<BoardFilters>(STORAGE_KEY_FILTERS, fallbackFilters, (parsedValue) => {
    const parsedFilters = parsedValue as Partial<BoardFilters>;
    return {
      keyword: typeof parsedFilters.keyword === "string" ? parsedFilters.keyword : fallbackFilters.keyword,
      sources: Array.isArray(parsedFilters.sources)
        ? parsedFilters.sources.filter((entry): entry is SourceId =>
            typeof entry === "string" && (SOURCE_OPTIONS as string[]).includes(entry),
          )
        : fallbackFilters.sources,
      locations: Array.isArray(parsedFilters.locations)
        ? parsedFilters.locations.filter((entry): entry is string => typeof entry === "string")
        : fallbackFilters.locations,
      workMode:
        typeof parsedFilters.workMode === "string" && WORK_MODE_FILTER_VALUES.includes(parsedFilters.workMode)
          ? parsedFilters.workMode
          : fallbackFilters.workMode,
      hidden:
        typeof parsedFilters.hidden === "string" && HIDDEN_FILTER_VALUES.includes(parsedFilters.hidden)
          ? parsedFilters.hidden
          : fallbackFilters.hidden,
      salaryMin: readSalaryBound(parsedFilters.salaryMin, fallbackFilters.salaryMin),
      salaryMax: readSalaryBound(parsedFilters.salaryMax, fallbackFilters.salaryMax),
    };
  });
}

export function writeStoredFilters(filters: BoardFilters): void {
  writeJsonToStorage(STORAGE_KEY_FILTERS, filters);
}
