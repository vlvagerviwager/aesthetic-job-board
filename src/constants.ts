export const STORAGE_KEY_THEME = "aesthetic-job-board:theme";
export const STORAGE_KEY_HIDDEN_OVERRIDES = "aesthetic-job-board:hidden-overrides";
export const STORAGE_KEY_FILTERS = "aesthetic-job-board:filters";

export const THEME_LIGHT = "light";
export const THEME_DARK = "dark";

export const DEFAULT_LOCATIONS: string[] = ["Dublin", "Wicklow"];

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
export const FETCH_PAGE_DELAY_MS = 350;
export const FETCH_REQUEST_TIMEOUT_MS = 25000;
export const FETCH_MAX_ACTIVELINK_PAGES = 18;
export const FETCH_MAX_PUBLICJOBS_PAGES = 12;
export const FETCH_PUBLICJOBS_PAGE_SIZE = 50;
export const FETCH_MAX_JOBS_PER_SOURCE = 900;

export const GRID_CELL_PX = 28;
export const CARD_SHADOW_OFFSET_PX = 4;
export const CARD_BORDER_WIDTH_PX = 2;
export const CARD_RADIUS_PX = 14;
export const TITLEBAR_RADIUS_PX = 11;
export const FOCUS_RING_WIDTH_PX = 3;

export const DATE_FALLBACK_YEAR = 2026;

export const REMOTE_KEYWORDS: string[] = ["remote", "work from home", "wfh", "fully remote"];
export const HYBRID_KEYWORDS: string[] = ["hybrid", "blended working", "part remote"];

export const DATA_URL = "./data/jobs.json";
