import type { SourceId } from "./types";

export const STORAGE_KEY_THEME = "aesthetic-job-board:theme";
export const STORAGE_KEY_HIDDEN_OVERRIDES = "aesthetic-job-board:hidden-overrides";
export const STORAGE_KEY_FILTERS = "aesthetic-job-board:filters";

export const THEME_LIGHT = "light";
export const THEME_DARK = "dark";

export const DEFAULT_LOCATIONS: string[] = ["Dublin", "Wicklow", "Remote"];

export const SOURCE_OPTIONS: SourceId[] = ["publicjobs", "activelink", "roompricegenie"];

export const LOCATION_OPTIONS: string[] = [
  "Dublin",
  "Wicklow",
  "Cork",
  "Galway",
  "Limerick",
  "Waterford",
  "Kilkenny",
  "Kildare",
  "Meath",
  "Louth",
  "Wexford",
  "Carlow",
  "Laois",
  "Offaly",
  "Westmeath",
  "Longford",
  "Tipperary",
  "Clare",
  "Kerry",
  "Mayo",
  "Sligo",
  "Leitrim",
  "Roscommon",
  "Donegal",
  "Cavan",
  "Monaghan",
  "Remote",
  "Hybrid",
  "Nationwide",
];

export const KEYWORD_MIN_LENGTH = 2;

export const REMOTE_KEYWORDS: string[] = ["remote", "work from home", "wfh", "fully remote"];
export const HYBRID_KEYWORDS: string[] = ["hybrid", "blended working", "part remote"];

export const DATA_URL = "./data/jobs.json";
