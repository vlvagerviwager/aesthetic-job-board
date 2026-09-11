import {
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

const SOURCE_FILTER_VALUES: SourceId[] = ["publicjobs", "activelink", "roompricegenie"];
const WORK_MODE_FILTER_VALUES: string[] = ["all", "remote", "hybrid", "onsite"];
const HIDDEN_FILTER_VALUES: string[] = ["active", "all", "hidden"];

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
  try {
    localStorage.setItem(STORAGE_KEY_THEME, themeName);
  } catch (error) {
    console.warn("Could not persist theme, continuing without saving.", error);
  }
}

export function readHiddenOverrides(): Record<string, boolean> {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY_HIDDEN_OVERRIDES);
    if (rawValue === null || rawValue === "") {
      return {};
    }
    const parsedValue = JSON.parse(rawValue) as Record<string, boolean>;
    if (typeof parsedValue !== "object" || parsedValue === null) {
      return {};
    }
    const cleanedOverrides: Record<string, boolean> = {};
    for (const [overrideId, overrideValue] of Object.entries(parsedValue)) {
      if (typeof overrideValue === "boolean") {
        cleanedOverrides[overrideId] = overrideValue;
      }
    }
    return cleanedOverrides;
  } catch (error) {
    console.warn("Could not read hidden overrides, starting empty.", error);
    return {};
  }
}

export function writeHiddenOverrides(overrides: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY_HIDDEN_OVERRIDES, JSON.stringify(overrides));
  } catch (error) {
    console.warn("Could not persist hidden overrides.", error);
  }
}

export function readStoredFilters(fallbackFilters: BoardFilters): BoardFilters {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY_FILTERS);
    if (rawValue === null || rawValue === "") {
      return fallbackFilters;
    }
    const parsedValue = JSON.parse(rawValue) as Partial<BoardFilters>;
    return {
      keyword: typeof parsedValue.keyword === "string" ? parsedValue.keyword : fallbackFilters.keyword,
      sources: Array.isArray(parsedValue.sources)
        ? parsedValue.sources.filter((entry): entry is SourceId =>
            typeof entry === "string" && (SOURCE_FILTER_VALUES as string[]).includes(entry),
          )
        : fallbackFilters.sources,
      locations: Array.isArray(parsedValue.locations)
        ? parsedValue.locations.filter((entry): entry is string => typeof entry === "string")
        : fallbackFilters.locations,
      workMode:
        typeof parsedValue.workMode === "string" && WORK_MODE_FILTER_VALUES.includes(parsedValue.workMode)
          ? parsedValue.workMode
          : fallbackFilters.workMode,
      hidden:
        typeof parsedValue.hidden === "string" && HIDDEN_FILTER_VALUES.includes(parsedValue.hidden)
          ? parsedValue.hidden
          : fallbackFilters.hidden,
      salaryMin: readSalaryBound(parsedValue.salaryMin, fallbackFilters.salaryMin),
      salaryMax: readSalaryBound(parsedValue.salaryMax, fallbackFilters.salaryMax),
    };
  } catch (error) {
    console.warn("Could not read stored filters, using defaults.", error);
    return fallbackFilters;
  }
}

export function writeStoredFilters(filters: BoardFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(filters));
  } catch (error) {
    console.warn("Could not persist filters.", error);
  }
}
