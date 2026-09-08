import {
  STORAGE_KEY_FILTERS,
  STORAGE_KEY_HIDDEN_OVERRIDES,
  STORAGE_KEY_THEME,
  THEME_DARK,
  THEME_LIGHT,
} from "./constants";
import type { BoardFilters } from "./types";

const THEME_QUERY = "(prefers-color-scheme: dark)";

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
  localStorage.setItem(STORAGE_KEY_THEME, themeName);
}

export function readHiddenOverrides(): Record<string, boolean> {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY_HIDDEN_OVERRIDES);
    if (rawValue === null || rawValue === "") {
      return {};
    }
    const parsedValue = JSON.parse(rawValue) as Record<string, boolean>;
    return parsedValue;
  } catch (error) {
    console.warn("Could not read hidden overrides, starting empty.", error);
    return {};
  }
}

export function writeHiddenOverrides(overrides: Record<string, boolean>): void {
  localStorage.setItem(STORAGE_KEY_HIDDEN_OVERRIDES, JSON.stringify(overrides));
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
      source: parsedValue.source ?? fallbackFilters.source,
      locations: Array.isArray(parsedValue.locations) ? parsedValue.locations : fallbackFilters.locations,
      workMode: parsedValue.workMode ?? fallbackFilters.workMode,
      hidden: parsedValue.hidden ?? fallbackFilters.hidden,
    };
  } catch (error) {
    console.warn("Could not read stored filters, using defaults.", error);
    return fallbackFilters;
  }
}

export function writeStoredFilters(filters: BoardFilters): void {
  localStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(filters));
}
