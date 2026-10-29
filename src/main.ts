import {
  DATA_URL,
  DEFAULT_LOCATIONS,
  LOCATION_OPTIONS,
  SOURCE_LABELS,
  SOURCE_OPTIONS,
  THEME_DARK,
  THEME_LIGHT,
} from "./constants";
import {
  isEffectivelyHidden,
  matchesFilters,
  paginateJobs,
  sortNewestFirst,
  titleMentionsOrganisation,
} from "./filters";
import {
  applyTheme,
  getInitialTheme,
  readHiddenOverrides,
  readSalaryBound,
  readStoredFilters,
  writeHiddenOverrides,
  writeStoredFilters,
} from "./storage";
import type {
  BoardFilters,
  HiddenFilter,
  JobListing,
  JobsPayload,
  SourceId,
  WorkModeFilter,
} from "./types";
import { workModeLabel } from "./workMode";
import { asSafeHttpUrl } from "./urls";

export function createDefaultFilters(overrides: Partial<BoardFilters> = {}): BoardFilters {
  return {
    keyword: "",
    sources: [],
    locations: [...DEFAULT_LOCATIONS],
    workMode: "all",
    hidden: "active",
    salaryMin: null,
    salaryMax: null,
    ...overrides,
  };
}

const DEFAULT_FILTERS: BoardFilters = createDefaultFilters();

export function toggleItem<T>(items: T[], value: T): T[] {
  return items.includes(value) ? items.filter((keptItem) => keptItem !== value) : [...items, value];
}

interface BoardState {
  allJobs: JobListing[];
  generatedAt: string;
  filters: BoardFilters;
  hiddenOverrides: Record<string, boolean>;
  visibleCount: number;
}

const RENDER_PAGE_SIZE = 60;
const KEYWORD_DEBOUNCE_MS = 150;
const SALARY_DEBOUNCE_MS = 150;

function debounce(callback: () => void, delayMs: number): () => void {
  let debounceHandle = 0;
  return () => {
    window.clearTimeout(debounceHandle);
    debounceHandle = window.setTimeout(callback, delayMs);
  };
}

const boardState: BoardState = {
  allJobs: [],
  generatedAt: "",
  filters: readStoredFilters(DEFAULT_FILTERS),
  hiddenOverrides: readHiddenOverrides(),
  visibleCount: RENDER_PAGE_SIZE,
};

function getElementByIdOrThrow(elementId: string): HTMLElement {
  const foundElement = document.getElementById(elementId);
  if (foundElement === null) {
    throw new Error(`Missing required element: ${elementId}`);
  }
  return foundElement;
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

function sourceLabel(source: SourceId): string {
  return SOURCE_LABELS[source];
}

export function renderChipGroup<T extends string>(chipGroup: {
  container: HTMLElement;
  options: readonly T[];
  label: (option: T) => string;
  getSelected: () => readonly T[];
  onToggle: (nextSelected: T[]) => void;
}): void {
  const { container, options, label, getSelected, onToggle } = chipGroup;
  container.innerHTML = "";
  const selected = getSelected();
  for (const option of options) {
    const chipButton = document.createElement("button");
    chipButton.type = "button";
    chipButton.className = "chip";
    chipButton.textContent = label(option);
    chipButton.setAttribute("aria-pressed", String(selected.includes(option)));
    chipButton.addEventListener("click", () => {
      onToggle(toggleItem([...getSelected()], option));
    });
    container.appendChild(chipButton);
  }
}

function renderSourceChips(): void {
  renderChipGroup<SourceId>({
    container: getElementByIdOrThrow("sourceChips"),
    options: SOURCE_OPTIONS,
    label: sourceLabel,
    getSelected: () => boardState.filters.sources,
    onToggle: (nextSources) => {
      boardState.filters.sources = nextSources;
      persistFiltersAndRender();
      renderSourceChips();
    },
  });
}

function renderLocationChips(): void {
  renderChipGroup<string>({
    container: getElementByIdOrThrow("locationChips"),
    options: LOCATION_OPTIONS,
    label: (locationOption) => locationOption,
    getSelected: () => boardState.filters.locations,
    onToggle: (nextLocations) => {
      boardState.filters.locations = nextLocations;
      persistFiltersAndRender();
      renderLocationChips();
    },
  });
}

function createTag(tagText: string, tagClass: string): HTMLSpanElement {
  const tagElement = document.createElement("span");
  tagElement.className = `tag ${tagClass}`;
  tagElement.textContent = tagText;
  return tagElement;
}

function renderJobs(restoreFocusJobId?: string): void {
  const scrollPosition = window.scrollY;
  const jobListContainer = getElementByIdOrThrow("jobList");
  const resultMeta = getElementByIdOrThrow("resultMeta");
  const filteredJobs = boardState.allJobs.filter((job) =>
    matchesFilters(job, boardState.filters, boardState.hiddenOverrides),
  );
  const sortedJobs = sortNewestFirst(filteredJobs);
  const { visibleJobs, remainingCount } = paginateJobs(sortedJobs, boardState.visibleCount);

  resultMeta.textContent =
    remainingCount > 0
      ? `showing ${visibleJobs.length} of ${sortedJobs.length} roles (${boardState.allJobs.length} total), newest first`
      : `showing ${sortedJobs.length} of ${boardState.allJobs.length} roles, newest first`;
  jobListContainer.innerHTML = "";

  if (sortedJobs.length === 0) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "window empty-state";
    const emptyTitle = document.createElement("h2");
    emptyTitle.textContent = "nothing matches those filters";
    const emptyHint = document.createElement("p");
    emptyHint.textContent = "Try clearing the keyword, widening the salary range, adding more locations, or including hidden roles.";
    emptyCard.appendChild(emptyTitle);
    emptyCard.appendChild(emptyHint);
    jobListContainer.appendChild(emptyCard);
    window.scrollTo(0, scrollPosition);
    return;
  }

  for (const job of visibleJobs) {
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
    titleLink.href = asSafeHttpUrl(job.url, "#");
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

    const locationLine = document.createElement("p");
    locationLine.className = "job-summary";
    locationLine.textContent = `Location: ${job.locationRaw}`;

    const hasSalary = job.salary.trim().length > 0;

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
    applyLink.href = asSafeHttpUrl(job.url, "#");
    applyLink.target = "_blank";
    applyLink.rel = "noopener noreferrer";
    applyLink.textContent = "view role";
    const hideButton = document.createElement("button");
    hideButton.type = "button";
    hideButton.className = "retro-button";
    hideButton.textContent = effectiveHidden ? "unhide" : "hide";
    hideButton.dataset.hideJobId = job.id;
    hideButton.addEventListener("click", () => {
      const nextOverrides: Record<string, boolean> = {
        ...boardState.hiddenOverrides,
        [job.id]: effectiveHidden === false,
      };
      boardState.hiddenOverrides = nextOverrides;
      writeHiddenOverrides(nextOverrides);
      renderJobs(job.id);
    });
    actionsRow.appendChild(applyLink);
    actionsRow.appendChild(hideButton);

    bodyElement.appendChild(titleHeading);
    bodyElement.appendChild(metaRow);
    if (titleMentionsOrganisation(job) === false) {
      const orgLine = document.createElement("p");
      orgLine.className = "job-summary";
      orgLine.textContent = job.organisation;
      bodyElement.appendChild(orgLine);
    }
    bodyElement.appendChild(locationLine);
    if (hasSalary) {
      const salaryLine = document.createElement("p");
      salaryLine.className = "job-salary";
      salaryLine.textContent = `Salary: ${job.salary.trim()}`;
      bodyElement.appendChild(salaryLine);
    }
    bodyElement.appendChild(datesLine);
    bodyElement.appendChild(actionsRow);

    cardElement.appendChild(titleBar);
    cardElement.appendChild(bodyElement);
    jobListContainer.appendChild(cardElement);
  }

  if (remainingCount > 0) {
    const showMoreButton = document.createElement("button");
    showMoreButton.type = "button";
    showMoreButton.id = "showMoreJobs";
    showMoreButton.className = "retro-button";
    showMoreButton.textContent = `show ${Math.min(remainingCount, RENDER_PAGE_SIZE)} more roles (${remainingCount} remaining)`;
    showMoreButton.addEventListener("click", () => {
      boardState.visibleCount += RENDER_PAGE_SIZE;
      renderJobs();
      document.getElementById("showMoreJobs")?.focus();
    });
    jobListContainer.appendChild(showMoreButton);
  }

  window.scrollTo(0, scrollPosition);

  if (restoreFocusJobId !== undefined) {
    const nextFocus = jobListContainer.querySelector<HTMLElement>(
      `[data-hide-job-id="${restoreFocusJobId}"]`,
    );
    if (nextFocus !== null) {
      nextFocus.focus({ preventScroll: true });
    } else {
      const firstHideButton = jobListContainer.querySelector<HTMLElement>("[data-hide-job-id]");
      firstHideButton?.focus({ preventScroll: true });
    }
  }
}

export function readSalaryInput(inputElement: HTMLInputElement): number | null {
  return readSalaryBound(inputElement.value.trim(), null);
}

function syncSalaryInput(inputElement: HTMLInputElement, boundValue: number | null): void {
  inputElement.value = boundValue === null ? "" : String(boundValue);
}

function persistFiltersAndRender(): void {
  writeStoredFilters(boardState.filters);
  boardState.visibleCount = RENDER_PAGE_SIZE;
  renderJobs();
}

function bindFilterControls(): void {
  const keywordInput = getElementByIdOrThrow("keywordInput") as HTMLInputElement;
  const workModeSelect = getElementByIdOrThrow("workModeSelect") as HTMLSelectElement;
  const hiddenSelect = getElementByIdOrThrow("hiddenSelect") as HTMLSelectElement;
  const salaryMinInput = getElementByIdOrThrow("salaryMinInput") as HTMLInputElement;
  const salaryMaxInput = getElementByIdOrThrow("salaryMaxInput") as HTMLInputElement;
  const clearButton = getElementByIdOrThrow("clearFilters") as HTMLButtonElement;

  keywordInput.value = boardState.filters.keyword;
  workModeSelect.value = boardState.filters.workMode;
  hiddenSelect.value = boardState.filters.hidden;
  syncSalaryInput(salaryMinInput, boardState.filters.salaryMin);
  syncSalaryInput(salaryMaxInput, boardState.filters.salaryMax);

  keywordInput.addEventListener(
    "input",
    debounce(() => {
      boardState.filters.keyword = keywordInput.value;
      persistFiltersAndRender();
    }, KEYWORD_DEBOUNCE_MS),
  );
  workModeSelect.addEventListener("change", () => {
    boardState.filters.workMode = workModeSelect.value as WorkModeFilter;
    persistFiltersAndRender();
  });
  hiddenSelect.addEventListener("change", () => {
    boardState.filters.hidden = hiddenSelect.value as HiddenFilter;
    persistFiltersAndRender();
  });
  const salaryRangeHint = getElementByIdOrThrow("salaryRangeHint");
  const syncSalaryHint = (): void => {
    const salaryMin = readSalaryInput(salaryMinInput);
    const salaryMax = readSalaryInput(salaryMaxInput);
    salaryRangeHint.hidden =
      salaryMin === null || salaryMax === null || salaryMin <= salaryMax;
  };
  const syncSalaryBounds = (): void => {
    boardState.filters.salaryMin = readSalaryInput(salaryMinInput);
    boardState.filters.salaryMax = readSalaryInput(salaryMaxInput);
    syncSalaryHint();
    persistFiltersAndRender();
  };
  salaryMinInput.addEventListener("input", debounce(syncSalaryBounds, SALARY_DEBOUNCE_MS));
  salaryMaxInput.addEventListener("input", debounce(syncSalaryBounds, SALARY_DEBOUNCE_MS));
  syncSalaryHint();
  clearButton.addEventListener("click", () => {
    boardState.filters = createDefaultFilters({ locations: [] });
    keywordInput.value = "";
    workModeSelect.value = "all";
    hiddenSelect.value = "active";
    syncSalaryInput(salaryMinInput, null);
    syncSalaryInput(salaryMaxInput, null);
    salaryRangeHint.hidden = true;
    persistFiltersAndRender();
    renderSourceChips();
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
    const response = await fetch(DATA_URL, { cache: "no-store" });
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

export function applyFiltersExpanded(
  section: HTMLElement,
  toggle: HTMLButtonElement,
  expanded: boolean,
): void {
  section.classList.toggle("is-collapsed", !expanded);
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.textContent = expanded ? "hide" : "show";
}

function bindFiltersCollapse(): void {
  const section = document.querySelector<HTMLElement>("section.filters");
  const toggle = document.getElementById("filtersToggle") as HTMLButtonElement | null;
  if (!section || !toggle) {
    return;
  }

  const mql = window.matchMedia("(min-width: 981px)");

  toggle.addEventListener("click", () => {
    const expanded = section.classList.contains("is-collapsed");
    applyFiltersExpanded(section, toggle, expanded);
  });

  const syncOpen = (): void => {
    applyFiltersExpanded(section, toggle, mql.matches);
  };

  syncOpen();
  mql.addEventListener("change", syncOpen);
}

async function initBoard(): Promise<void> {
  bindThemeToggle();
  bindFilterControls();
  bindFiltersCollapse();
  renderSourceChips();
  renderLocationChips();
  await loadJobs();
}

if (typeof document !== "undefined") {
  void initBoard();
}
