import {
  DATA_URL,
  DEFAULT_LOCATIONS,
  KEYWORD_MIN_LENGTH,
  LOCATION_OPTIONS,
  THEME_DARK,
  THEME_LIGHT,
} from "./constants";
import {
  applyTheme,
  getInitialTheme,
  readHiddenOverrides,
  readStoredFilters,
  writeHiddenOverrides,
  writeStoredFilters,
} from "./storage";
import type {
  BoardFilters,
  HiddenFilter,
  JobListing,
  JobsPayload,
  SourceFilter,
  WorkModeFilter,
} from "./types";
import { workModeLabel } from "./workMode";

const DEFAULT_FILTERS: BoardFilters = {
  keyword: "",
  source: "all",
  locations: [...DEFAULT_LOCATIONS],
  workMode: "all",
  hidden: "active",
};

interface BoardState {
  allJobs: JobListing[];
  generatedAt: string;
  filters: BoardFilters;
  hiddenOverrides: Record<string, boolean>;
}

const boardState: BoardState = {
  allJobs: [],
  generatedAt: "",
  filters: readStoredFilters(DEFAULT_FILTERS),
  hiddenOverrides: readHiddenOverrides(),
};

function getElementByIdOrThrow(elementId: string): HTMLElement {
  const foundElement = document.getElementById(elementId);
  if (foundElement === null) {
    throw new Error(`Missing required element: ${elementId}`);
  }
  return foundElement;
}

function isEffectivelyHidden(job: JobListing, overrides: Record<string, boolean>): boolean {
  const overrideValue = overrides[job.id];
  if (typeof overrideValue === "boolean") {
    return overrideValue;
  }
  return job.hidden;
}

function matchesKeyword(job: JobListing, keywordRaw: string): boolean {
  const trimmedKeyword = keywordRaw.trim().toLowerCase();
  if (trimmedKeyword.length < KEYWORD_MIN_LENGTH) {
    return true;
  }
  const haystack = `${job.title} ${job.organisation} ${job.summary} ${job.locationRaw} ${job.salary}`.toLowerCase();
  return haystack.includes(trimmedKeyword);
}

function matchesLocation(job: JobListing, selectedLocations: string[]): boolean {
  if (selectedLocations.length === 0) {
    return true;
  }
  const locationLower = job.locationRaw.toLowerCase();
  for (const selectedLocation of selectedLocations) {
    if (locationLower.includes(selectedLocation.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function matchesFilters(job: JobListing, filters: BoardFilters, overrides: Record<string, boolean>): boolean {
  const effectiveHidden = isEffectivelyHidden(job, overrides);
  if (filters.hidden === "active" && effectiveHidden) {
    return false;
  }
  if (filters.hidden === "hidden" && effectiveHidden === false) {
    return false;
  }
  if (filters.source !== "all" && job.source !== filters.source) {
    return false;
  }
  if (filters.workMode !== "all" && job.workMode !== filters.workMode) {
    return false;
  }
  if (matchesLocation(job, filters.locations) === false) {
    return false;
  }
  if (matchesKeyword(job, filters.keyword) === false) {
    return false;
  }
  return true;
}

function sortNewestFirst(jobList: JobListing[]): JobListing[] {
  const sortedJobs = [...jobList];
  sortedJobs.sort((firstJob, secondJob) => {
    const firstTime = Date.parse(firstJob.postedDate);
    const secondTime = Date.parse(secondJob.postedDate);
    return secondTime - firstTime;
  });
  return sortedJobs;
}

function formatDate(dateIso: string): string {
  const parsedDate = new Date(dateIso);
  if (Number.isNaN(parsedDate.getTime())) {
    return dateIso;
  }
  return parsedDate.toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sourceLabel(source: string): string {
  return source === "publicjobs" ? "publicjobs" : "activelink";
}

function renderLocationChips(): void {
  const chipsContainer = getElementByIdOrThrow("locationChips");
  chipsContainer.innerHTML = "";
  for (const locationOption of LOCATION_OPTIONS) {
    const isPressed = boardState.filters.locations.includes(locationOption);
    const chipButton = document.createElement("button");
    chipButton.type = "button";
    chipButton.className = "chip";
    chipButton.textContent = locationOption;
    chipButton.setAttribute("aria-pressed", String(isPressed));
    chipButton.addEventListener("click", () => {
      const currentLocations = boardState.filters.locations;
      const locationIndex = currentLocations.indexOf(locationOption);
      if (locationIndex >= 0) {
        boardState.filters.locations = currentLocations.filter(
          (keptLocation) => keptLocation !== locationOption,
        );
      } else {
        boardState.filters.locations = [...currentLocations, locationOption];
      }
      persistFiltersAndRender();
      renderLocationChips();
    });
    chipsContainer.appendChild(chipButton);
  }
}

function createTag(tagText: string, tagClass: string): HTMLSpanElement {
  const tagElement = document.createElement("span");
  tagElement.className = `tag ${tagClass}`;
  tagElement.textContent = tagText;
  return tagElement;
}

function renderJobs(): void {
  const jobListContainer = getElementByIdOrThrow("jobList");
  const resultMeta = getElementByIdOrThrow("resultMeta");
  const filteredJobs = boardState.allJobs.filter((job) =>
    matchesFilters(job, boardState.filters, boardState.hiddenOverrides),
  );
  const sortedJobs = sortNewestFirst(filteredJobs);

  resultMeta.textContent = `showing ${sortedJobs.length} of ${boardState.allJobs.length} roles, newest first`;
  jobListContainer.innerHTML = "";

  if (sortedJobs.length === 0) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "window empty-state";
    const emptyTitle = document.createElement("h2");
    emptyTitle.textContent = "nothing matches those filters";
    const emptyHint = document.createElement("p");
    emptyHint.textContent = "Try clearing the keyword, adding more locations, or including hidden roles.";
    emptyCard.appendChild(emptyTitle);
    emptyCard.appendChild(emptyHint);
    jobListContainer.appendChild(emptyCard);
    return;
  }

  for (const job of sortedJobs) {
    const effectiveHidden = isEffectivelyHidden(job, boardState.hiddenOverrides);
    const cardElement = document.createElement("article");
    cardElement.className = `window job-card${effectiveHidden ? " is-hidden-job" : ""}${
      job.workMode === "remote" ? " is-remote" : ""
    }`;

    const titleBar = document.createElement("div");
    titleBar.className = "titlebar";
    const titleBarText = document.createElement("p");
    titleBarText.className = "titlebar-text";
    titleBarText.textContent = `${sourceLabel(job.source)} posted ${formatDate(job.postedDate)}`;
    const modeTagMini = document.createElement("span");
    modeTagMini.className = "tag";
    modeTagMini.textContent = workModeLabel(job.workMode);
    titleBar.appendChild(titleBarText);
    titleBar.appendChild(modeTagMini);

    const bodyElement = document.createElement("div");
    bodyElement.className = "job-body";

    const titleHeading = document.createElement("h2");
    titleHeading.className = "job-title";
    const titleLink = document.createElement("a");
    titleLink.href = job.url;
    titleLink.target = "_blank";
    titleLink.rel = "noopener noreferrer";
    titleLink.textContent = job.title;
    titleHeading.appendChild(titleLink);

    const metaRow = document.createElement("div");
    metaRow.className = "job-meta";
    metaRow.appendChild(createTag(sourceLabel(job.source), `tag-source-${job.source}`));
    metaRow.appendChild(createTag(workModeLabel(job.workMode), `tag-mode-${job.workMode}`));
    if (effectiveHidden) {
      metaRow.appendChild(createTag("hidden", "tag-hidden"));
    }

    const orgLine = document.createElement("p");
    orgLine.className = "job-summary";
    orgLine.textContent = job.organisation;

    const locationLine = document.createElement("p");
    locationLine.className = "job-summary";
    locationLine.textContent = `Location: ${job.locationRaw}`;

    const hasSalary = job.salary.trim().length > 0;

    const summaryLine = document.createElement("p");
    summaryLine.className = "job-summary";
    summaryLine.textContent = job.summary;

    const datesLine = document.createElement("div");
    datesLine.className = "job-dates";
    const postedSpan = document.createElement("span");
    postedSpan.textContent = `Posted: ${formatDate(job.postedDate)}`;
    const closingSpan = document.createElement("span");
    closingSpan.textContent = `Closes: ${formatDate(job.closingDate)}`;
    datesLine.appendChild(postedSpan);
    datesLine.appendChild(closingSpan);

    const actionsRow = document.createElement("div");
    actionsRow.className = "job-actions";
    const applyLink = document.createElement("a");
    applyLink.className = "retro-button primary";
    applyLink.href = job.url;
    applyLink.target = "_blank";
    applyLink.rel = "noopener noreferrer";
    applyLink.textContent = "view role";
    const hideButton = document.createElement("button");
    hideButton.type = "button";
    hideButton.className = "retro-button";
    hideButton.textContent = effectiveHidden ? "unhide" : "hide";
    hideButton.addEventListener("click", () => {
      const nextOverrides: Record<string, boolean> = {
        ...boardState.hiddenOverrides,
        [job.id]: effectiveHidden === false,
      };
      boardState.hiddenOverrides = nextOverrides;
      writeHiddenOverrides(nextOverrides);
      renderJobs();
    });
    actionsRow.appendChild(applyLink);
    actionsRow.appendChild(hideButton);

    bodyElement.appendChild(titleHeading);
    bodyElement.appendChild(metaRow);
    bodyElement.appendChild(orgLine);
    bodyElement.appendChild(locationLine);
    if (hasSalary) {
      const salaryLine = document.createElement("p");
      salaryLine.className = "job-salary";
      salaryLine.textContent = `Salary: ${job.salary.trim()}`;
      bodyElement.appendChild(salaryLine);
    }
    if (job.summary.trim().length > 0) {
      bodyElement.appendChild(summaryLine);
    }
    bodyElement.appendChild(datesLine);
    bodyElement.appendChild(actionsRow);

    cardElement.appendChild(titleBar);
    cardElement.appendChild(bodyElement);
    jobListContainer.appendChild(cardElement);
  }
}

function persistFiltersAndRender(): void {
  writeStoredFilters(boardState.filters);
  renderJobs();
}

function bindFilterControls(): void {
  const keywordInput = getElementByIdOrThrow("keywordInput") as HTMLInputElement;
  const sourceSelect = getElementByIdOrThrow("sourceSelect") as HTMLSelectElement;
  const workModeSelect = getElementByIdOrThrow("workModeSelect") as HTMLSelectElement;
  const hiddenSelect = getElementByIdOrThrow("hiddenSelect") as HTMLSelectElement;
  const clearButton = getElementByIdOrThrow("clearFilters") as HTMLButtonElement;

  keywordInput.value = boardState.filters.keyword;
  sourceSelect.value = boardState.filters.source;
  workModeSelect.value = boardState.filters.workMode;
  hiddenSelect.value = boardState.filters.hidden;

  keywordInput.addEventListener("input", () => {
    boardState.filters.keyword = keywordInput.value;
    persistFiltersAndRender();
  });
  sourceSelect.addEventListener("change", () => {
    boardState.filters.source = sourceSelect.value as SourceFilter;
    persistFiltersAndRender();
  });
  workModeSelect.addEventListener("change", () => {
    boardState.filters.workMode = workModeSelect.value as WorkModeFilter;
    persistFiltersAndRender();
  });
  hiddenSelect.addEventListener("change", () => {
    boardState.filters.hidden = hiddenSelect.value as HiddenFilter;
    persistFiltersAndRender();
  });
  clearButton.addEventListener("click", () => {
    boardState.filters = {
      keyword: "",
      source: "all",
      locations: [...DEFAULT_LOCATIONS],
      workMode: "all",
      hidden: "active",
    };
    keywordInput.value = "";
    sourceSelect.value = "all";
    workModeSelect.value = "all";
    hiddenSelect.value = "active";
    persistFiltersAndRender();
    renderLocationChips();
  });
}

function bindThemeToggle(): void {
  const themeToggle = getElementByIdOrThrow("themeToggle") as HTMLButtonElement;
  const initialTheme = getInitialTheme();
  applyTheme(initialTheme);
  const syncToggle = (themeName: string): void => {
    themeToggle.textContent = themeName === THEME_DARK ? "light mode" : "dark mode";
    themeToggle.setAttribute("aria-pressed", String(themeName === THEME_DARK));
  };
  syncToggle(initialTheme);
  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme ?? THEME_LIGHT;
    const nextTheme = currentTheme === THEME_DARK ? THEME_LIGHT : THEME_DARK;
    applyTheme(nextTheme);
    syncToggle(nextTheme);
  });
}

async function loadJobs(): Promise<void> {
  const buildMeta = getElementByIdOrThrow("buildMeta");
  try {
    const response = await fetch(DATA_URL);
    if (response.ok === false) {
      throw new Error(`jobs fetch failed with status ${response.status}`);
    }
    const payload = (await response.json()) as JobsPayload;
    boardState.allJobs = sortNewestFirst(payload.jobs);
    boardState.generatedAt = payload.generatedAt;
    const generatedLabel = formatDate(payload.generatedAt);
    buildMeta.textContent = `fresh as of ${generatedLabel}, ${payload.jobs.length} roles`;
  } catch (error) {
    console.error("Could not load jobs payload", error);
    buildMeta.textContent = "could not load roles yet, run bun run jobs:fetch";
  }
  renderJobs();
}

async function initBoard(): Promise<void> {
  bindThemeToggle();
  bindFilterControls();
  renderLocationChips();
  await loadJobs();
}

void initBoard();
