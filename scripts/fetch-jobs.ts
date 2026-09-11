import * as cheerio from "cheerio";
import { asSafeHttpUrl, resolveBoardUrl } from "../src/urls";
import { detectWorkMode } from "../src/workMode";
import type { JobListing, JobsPayload, SourceId } from "../src/types";

interface SourceConfig {
  id: SourceId;
  label: string;
  boardUrl: string;
}

const SOURCES_CONFIG_PATH = "config/sources.json";
const FALLBACK_PUBLICJOBS_BOARD_URL =
  "https://publicjobs.tal.net/vx/lang-en-GB/mobile-0/appcentre-ext/brand-4/xf-7ecb593daca6/candidate/jobboard/vacancy/3/adv/";
const FALLBACK_ACTIVELINK_BOARD_URL = "https://www.activelink.ie/vacancies";
const FALLBACK_ROOMPRICEGENIE_BOARD_URL = "https://roompricegenie.com/careers/#jobs";
const ACTIVELINK_ORIGIN = "https://www.activelink.ie";

type BoardUrlSet = Record<"publicjobs" | "activelink" | "roompricegenie", string>;

async function readBoardUrls(): Promise<BoardUrlSet> {
  const fallbackUrls: BoardUrlSet = {
    publicjobs: FALLBACK_PUBLICJOBS_BOARD_URL,
    activelink: FALLBACK_ACTIVELINK_BOARD_URL,
    roompricegenie: FALLBACK_ROOMPRICEGENIE_BOARD_URL,
  };
  try {
    const configFile = Bun.file(SOURCES_CONFIG_PATH);
    if ((await configFile.exists()) === false) {
      return fallbackUrls;
    }
    const configuredSources = (await configFile.json()) as SourceConfig[];
    if (Array.isArray(configuredSources) === false) {
      return fallbackUrls;
    }
    const resolvedUrls = { ...fallbackUrls };
    for (const sourceEntry of configuredSources) {
      if (
        sourceEntry.id === "publicjobs" ||
        sourceEntry.id === "activelink" ||
        sourceEntry.id === "roompricegenie"
      ) {
        if (typeof sourceEntry.boardUrl === "string" && sourceEntry.boardUrl !== "") {
          resolvedUrls[sourceEntry.id] = sourceEntry.boardUrl;
        }
      }
    }
    return resolvedUrls;
  } catch (error) {
    console.warn(`Could not read ${SOURCES_CONFIG_PATH}, using fallback board URLs.`, error);
    return fallbackUrls;
  }
}

const REQUEST_TIMEOUT_MS = 25000;
const FETCH_MAX_ATTEMPTS = 3;
const DELAY_BETWEEN_PAGES_MS = 350;
const PUBLICJOBS_PAGE_SIZE = 50;
const PUBLICJOBS_MAX_PAGES = 12;
const ACTIVELINK_MAX_PAGES = 18;
const MAX_JOBS_PER_SOURCE = 900;
const FIRST_PAGE_INDEX = 0;

const HIDDEN_CONFIG_PATH = "config/hidden.json";
const OUTPUT_PAYLOAD_PATH = "public/data/jobs.json";

const EXCLUDED_ACTIVELINK_SECTIONS: string[] = ["tenders", "voluntary", "volunteering"];
const EXCLUDED_ACTIVELINK_CATEGORY_PATTERN = /\b(tenders?|voluntary|volunteering)\b/i;
const EXCLUDED_ACTIVELINK_TITLE_PATTERNS: RegExp[] = [
  /^\s*volunteers?\b/i,
  /^\s*voluntary\b/i,
  /invitation to tender/i,
  /request for tenders?/i,
];

const SALARY_LABEL_PATTERN = /\b(salary|salary scale|salary range|remuneration|hourly rate|rate of pay)\b/i;
const SALARY_PARAGRAPH_START_PATTERN = /^\s*salary\b/i;
const SALARY_CONTENT_PATTERN =
  /€|euro|\beur\b|per annum|per hour|hourly|\bscale\b|\bpay\b|paid|remuner|negotiat|commensurate|experience|depend|pro rata|stipend|honorarium|allowance|increment|\bgrade\b|\brates?\b|wage|b\.o\.e\.|benchmark|align|accordance|qualification/i;
const SALARY_STRICT_CONTENT_PATTERN =
  /€|euro|\beur\b|per annum|per hour|hourly|\bscale\b|\bpay\b|paid|remuner|negotiat|commensurate|depend|pro rata|stipend|honorarium|allowance|\bgrade\b|\brates?\b|wage|b\.o\.e\./i;
const SALARY_TEXT_MAX_LENGTH = 160;
const SALARY_ELLIPSIS = "…";
const DETAIL_PROGRESS_LOG_EVERY = 50;

const MONTH_LOOKUP: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  sept: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function sleepMilliseconds(delayMs: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, delayMs);
  });
}

async function fetchHtmlWithTimeout(pageUrl: string): Promise<string> {
  let lastError: unknown = new Error(`Request failed for ${pageUrl}: no attempts made`);
  for (let attemptNumber = 1; attemptNumber <= FETCH_MAX_ATTEMPTS; attemptNumber += 1) {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(pageUrl, {
        signal: abortController.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; aesthetic-job-board/0.1; +https://example.com)",
          Accept: "text/html",
        },
      });
      if (response.ok === false) {
        throw new Error(`Request failed for ${pageUrl} with status ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attemptNumber < FETCH_MAX_ATTEMPTS) {
        console.warn(`Attempt ${attemptNumber} failed for ${pageUrl}, retrying...`, error);
        await sleepMilliseconds(attemptNumber * DELAY_BETWEEN_PAGES_MS);
      }
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
  throw lastError;
}

function cleanFieldText(rawText: string, labelToStrip: string): string {
  const withoutLabel = rawText.replace(labelToStrip, "");
  return withoutLabel.replace(/\s+/g, " ").trim();
}

export function parsePublicjobsDate(dateText: string): string {
  const trimmedText = dateText.trim();
  const dateParts = trimmedText.split(/\s+/);
  if (dateParts.length < 3) {
    return new Date().toISOString();
  }
  const dayPart = dateParts[0] ?? "";
  const monthPart = (dateParts[1] ?? "").toLowerCase();
  const yearPart = dateParts[2] ?? "";
  const monthNumber = MONTH_LOOKUP[monthPart];
  if (/^\d{1,2}$/.test(dayPart) === false || monthNumber === undefined || /^\d{4}$/.test(yearPart) === false) {
    return new Date().toISOString();
  }
  const paddedDay = dayPart.padStart(2, "0");
  const parsedDate = new Date(`${yearPart}-${monthNumber}-${paddedDay}T09:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString();
  }
  return parsedDate.toISOString();
}

export function parseActivelinkDate(dateAttr: string): string {
  const trimmedAttr = dateAttr.trim();
  if (trimmedAttr === "") {
    return new Date().toISOString();
  }
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(trimmedAttr)
    ? new Date(`${trimmedAttr}T09:00:00.000Z`)
    : new Date(trimmedAttr);
  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString();
  }
  return parsedDate.toISOString();
}

export function resolvePublicjobsUrl(detailHref: string, boardUrl: string): string {
  return resolveBoardUrl(detailHref, boardUrl);
}

function extractOrganisationFromActivelinkTitle(fullTitle: string, fallbackOrg: string): string {
  const colonIndex = fullTitle.indexOf(":");
  if (colonIndex > 0) {
    return fullTitle.slice(0, colonIndex).trim();
  }
  return fallbackOrg;
}

function truncateSalaryText(salaryText: string): string {
  const trimmedText = salaryText.replace(/\s+/g, " ").trim();
  if (trimmedText.length <= SALARY_TEXT_MAX_LENGTH) {
    return trimmedText;
  }
  return `${trimmedText.slice(0, SALARY_TEXT_MAX_LENGTH).trim()}${SALARY_ELLIPSIS}`;
}

export function extractSalaryFromDetail(detailHtml: string): string {
  const detailRoot = cheerio.load(detailHtml);
  const candidateElements = detailRoot("p, li");
  for (let elementIndex = 0; elementIndex < candidateElements.length; elementIndex += 1) {
    const candidateElement = candidateElements.eq(elementIndex);
    const labelText = candidateElement
      .find("strong, b")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const hasSalaryLabel = labelText !== "" && SALARY_LABEL_PATTERN.test(labelText);
    const elementText = candidateElement.text().replace(/\s+/g, " ").trim();
    const startsWithSalary = SALARY_PARAGRAPH_START_PATTERN.test(elementText);
    if (hasSalaryLabel && SALARY_CONTENT_PATTERN.test(elementText)) {
      return truncateSalaryText(elementText);
    }
    if (startsWithSalary && SALARY_STRICT_CONTENT_PATTERN.test(elementText)) {
      return truncateSalaryText(elementText);
    }
  }
  return "";
}

async function readPreviousSalaries(): Promise<Map<string, string>> {
  try {
    const payloadFile = Bun.file(OUTPUT_PAYLOAD_PATH);
    if ((await payloadFile.exists()) === false) {
      return new Map<string, string>();
    }
    const previousPayload = (await payloadFile.json()) as JobsPayload;
    if (Array.isArray(previousPayload.jobs) === false) {
      return new Map<string, string>();
    }
    return new Map(previousPayload.jobs.map((jobEntry) => [jobEntry.id, jobEntry.salary ?? ""]));
  } catch (error) {
    console.warn("Could not read previous jobs payload for salary cache, refetching all.", error);
    return new Map<string, string>();
  }
}

const SALARY_FETCH_CONCURRENCY = 5;
const SALARY_SAMPLE_LOG_COUNT = 5;

async function enrichActivelinkSalaries(
  collectedJobs: JobListing[],
  previousSalaries: Map<string, string>,
): Promise<void> {
  const freshJobs: JobListing[] = [];
  for (const jobEntry of collectedJobs) {
    if (previousSalaries.has(jobEntry.id)) {
      jobEntry.salary = previousSalaries.get(jobEntry.id) ?? "";
    } else {
      freshJobs.push(jobEntry);
    }
  }
  console.log(`Reusing cached salary text for ${collectedJobs.length - freshJobs.length} activelink roles`);
  let freshIndex = 0;
  async function enrichNextBatch(): Promise<void> {
    while (freshIndex < freshJobs.length) {
      const currentIndex = freshIndex;
      freshIndex += 1;
      const jobEntry = freshJobs[currentIndex];
      if (jobEntry === undefined) {
        continue;
      }
      if (currentIndex % DETAIL_PROGRESS_LOG_EVERY === 0) {
        console.log(`Fetching activelink details ${currentIndex + 1} of ${freshJobs.length}`);
      }
      try {
        const detailHtml = await fetchHtmlWithTimeout(jobEntry.url);
        jobEntry.salary = extractSalaryFromDetail(detailHtml);
      } catch (error) {
        console.warn(`Could not fetch details for ${jobEntry.id}, leaving salary empty.`, error);
        jobEntry.salary = "";
      }
      await sleepMilliseconds(DELAY_BETWEEN_PAGES_MS);
    }
  }
  const workerCount = Math.min(SALARY_FETCH_CONCURRENCY, freshJobs.length);
  const workers: Promise<void>[] = [];
  for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
    workers.push(enrichNextBatch());
  }
  await Promise.all(workers);
  const withSalary = collectedJobs.filter((jobEntry) => jobEntry.salary !== "").length;
  console.log(`Found salary text for ${withSalary} of ${collectedJobs.length} activelink roles`);
  const salarySamples = collectedJobs
    .map((jobEntry) => jobEntry.salary)
    .filter((salaryText) => salaryText !== "")
    .slice(0, SALARY_SAMPLE_LOG_COUNT);
  for (const salarySample of salarySamples) {
    console.log(`Salary sample: ${salarySample}`);
  }
}
const ASHBY_POSTING_API_URL = "https://api.ashbyhq.com/posting-api/job-board";
const ASHBY_BOARD_SLUGS: Record<string, string> = {
  roompricegenie: "roompricegenie",
};

export interface AshbyJobPosting {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  publishedAt?: string;
  jobUrl?: string;
  compensationTierSummary?: string | null;
}

export function mapAshbyPostingToListing(
  posting: AshbyJobPosting,
  source: SourceId,
  organisation: string,
): JobListing | null {
  const postingId = (posting.id ?? "").trim();
  const titleText = (posting.title ?? "").replace(/\s+/g, " ").trim();
  const detailUrl = (posting.jobUrl ?? "").trim();
  if (postingId === "" || titleText === "" || detailUrl === "") {
    return null;
  }
  const locationParts = [posting.location, ...(posting.secondaryLocations ?? []).map((entry) => entry.location)]
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter((part) => part !== "");
  const locationRaw = locationParts.length > 0 ? [...new Set(locationParts)].join("; ") : "Remote";
  const summaryParts = [posting.team, posting.department, posting.employmentType]
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter((part) => part !== "");
  const summaryText = [...new Set(summaryParts)].join(" · ");
  const safeUrl = asSafeHttpUrl(detailUrl, "");
  if (safeUrl === "") {
    return null;
  }
  const postedDate = parseAshbyDate(posting.publishedAt ?? "");
  return {
    id: `${source}-${postingId.slice(0, 8)}`,
    source,
    title: titleText,
    url: safeUrl,
    organisation,
    locationRaw,
    summary: summaryText === "" ? organisation : summaryText,
    postedDate,
    closingDate: postedDate,
    workMode: detectWorkMode(locationRaw, titleText, summaryText),
    hidden: false,
    salary: (posting.compensationTierSummary ?? "").replace(/\s+/g, " ").trim(),
  };
}

function parseAshbyDate(publishedAt: string): string {
  const trimmedValue = publishedAt.trim();
  if (trimmedValue === "") {
    return new Date().toISOString();
  }
  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString();
  }
  return parsedDate.toISOString();
}

export async function fetchAshbyBoardListings(
  source: SourceId,
  organisation: string,
  boardUrl: string,
): Promise<JobListing[]> {
  const orgSlug = ASHBY_BOARD_SLUGS[source];
  if (orgSlug === undefined) {
    throw new Error(`No Ashby organisation slug configured for source "${source}".`);
  }
  const apiUrl = `${ASHBY_POSTING_API_URL}/${orgSlug}`;
  console.log(`Fetching ${source} jobs from Ashby API`);
  const responseText = await fetchHtmlWithTimeout(apiUrl);
  let payload: { jobs?: AshbyJobPosting[] };
  try {
    payload = JSON.parse(responseText) as { jobs?: AshbyJobPosting[] };
  } catch {
    throw new Error(`Ashby API for ${source} did not return JSON (${apiUrl}). The board may have moved; check ${boardUrl}.`);
  }
  if (Array.isArray(payload.jobs) === false) {
    throw new Error(`Ashby API for ${source} returned no job list (${apiUrl}). The board markup or API may have changed.`);
  }
  const collectedJobs: JobListing[] = [];
  for (const posting of payload.jobs ?? []) {
    const listing = mapAshbyPostingToListing(posting, source, organisation);
    if (listing !== null) {
      collectedJobs.push(listing);
    }
    if (collectedJobs.length >= MAX_JOBS_PER_SOURCE) {
      break;
    }
  }
  if (collectedJobs.length === 0) {
    throw new Error(`Ashby API for ${source} returned no usable listings (${apiUrl}).`);
  }
  return collectedJobs;
}

function extractActivelinkSection(relativeHref: string): string {
  const sectionMatch = relativeHref.match(/^\/vacancies\/([^/?#]+)/);
  return sectionMatch?.[1] ?? "";
}

function isExcludedActivelinkListing(
  sectionSlug: string,
  titleText: string,
  categoryTexts: string[],
): boolean {
  if (EXCLUDED_ACTIVELINK_SECTIONS.includes(sectionSlug.toLowerCase())) {
    return true;
  }
  for (const categoryText of categoryTexts) {
    if (EXCLUDED_ACTIVELINK_CATEGORY_PATTERN.test(categoryText)) {
      return true;
    }
  }
  for (const titlePattern of EXCLUDED_ACTIVELINK_TITLE_PATTERNS) {
    if (titlePattern.test(titleText)) {
      return true;
    }
  }
  return false;
}

async function fetchPublicjobsListings(boardUrl: string): Promise<JobListing[]> {
  const collectedJobs: JobListing[] = [];
  for (let pageIndex = FIRST_PAGE_INDEX; pageIndex < PUBLICJOBS_MAX_PAGES; pageIndex += 1) {
    const startOffset = pageIndex * PUBLICJOBS_PAGE_SIZE;
    const pageUrl = startOffset === 0 ? boardUrl : `${boardUrl}?start=${startOffset}`;
    console.log(`Fetching publicjobs page offset ${startOffset}`);
    const pageHtml = await fetchHtmlWithTimeout(pageUrl);
    const cheerioRoot = cheerio.load(pageHtml);
    const jobCards = cheerioRoot("li.opp-container");
    if (jobCards.length === 0) {
      if (pageIndex === FIRST_PAGE_INDEX) {
        throw new Error(
          `Publicjobs returned no listings on the first page (${pageUrl}). The board URL token in ${SOURCES_CONFIG_PATH} may have rotated; open the Publicjobs job board in a browser, copy the fresh listing URL, and update the config.`,
        );
      }
      break;
    }
    jobCards.each((_cardIndex, cardElement) => {
      const cardSelection = cheerioRoot(cardElement);
      const opportunityId = cardSelection.attr("data-oppid") ?? "";
      const titleLink = cardSelection.find("a.subject").first();
      const titleText = titleLink.text().replace(/\s+/g, " ").trim();
      const detailHref = titleLink.attr("href") ?? boardUrl;
      if (opportunityId === "" || titleText === "") {
        return;
      }
      const vacancyType = cleanFieldText(
        cardSelection.find(".candidate-opp-field-3").first().text(),
        "Vacancy type:",
      );
      const organisation = cleanFieldText(
        cardSelection.find(".candidate-opp-field-5").first().text(),
        "Department/Organisation:",
      );
      const locationRaw = cleanFieldText(
        cardSelection.find(".candidate-opp-field-6").first().text(),
        "Location:",
      );
      const advertisingText = cleanFieldText(
        cardSelection.find(".candidate-opp-field-7").first().text(),
        "Advertising Date:",
      );
      const closingText = cleanFieldText(
        cardSelection.find(".candidate-opp-field-8").first().text(),
        "Closing Date:",
      );
      const postedDate = advertisingText === "" ? new Date().toISOString() : parsePublicjobsDate(advertisingText);
      const closingDate = closingText === "" ? postedDate : parsePublicjobsDate(closingText);
      const summaryText = vacancyType === "" ? organisation : `${vacancyType} at ${organisation}`;
      const jobId = `publicjobs-${opportunityId}`;
      collectedJobs.push({
        id: jobId,
        source: "publicjobs",
        title: titleText,
        url: resolvePublicjobsUrl(detailHref, boardUrl),
        organisation: organisation === "" ? "Publicjobs role" : organisation,
        locationRaw: locationRaw === "" ? "Ireland" : locationRaw,
        summary: summaryText,
        postedDate,
        closingDate,
        workMode: detectWorkMode(locationRaw, titleText, summaryText),
        hidden: false,
        salary: "",
      });
    });
    if (jobCards.length < PUBLICJOBS_PAGE_SIZE) {
      break;
    }
    if (collectedJobs.length >= MAX_JOBS_PER_SOURCE) {
      break;
    }
    await sleepMilliseconds(DELAY_BETWEEN_PAGES_MS);
  }
  return collectedJobs;
}

async function fetchActivelinkListings(
  boardUrl: string,
  previousSalaries: Map<string, string>,
): Promise<JobListing[]> {
  const collectedJobs: JobListing[] = [];
  for (let pageIndex = FIRST_PAGE_INDEX; pageIndex < ACTIVELINK_MAX_PAGES; pageIndex += 1) {
    const pageUrl = pageIndex === 0 ? boardUrl : `${boardUrl}?page=${pageIndex}`;
    console.log(`Fetching activelink page ${pageIndex}`);
    const pageHtml = await fetchHtmlWithTimeout(pageUrl);
    const cheerioRoot = cheerio.load(pageHtml);
    const teaserCards = cheerioRoot("article.teaser");
    if (teaserCards.length === 0) {
      if (pageIndex === FIRST_PAGE_INDEX) {
        throw new Error(
          `Activelink returned no listings on the first page (${pageUrl}). The site markup may have changed; inspect the vacancies page and update the teaser selectors.`,
        );
      }
      break;
    }
    teaserCards.each((_cardIndex, cardElement) => {
      const cardSelection = cheerioRoot(cardElement);
      const titleLink = cardSelection.find(".teaser__title a").first();
      const titleText = titleLink.find(".field--name-title").text().replace(/\s+/g, " ").trim();
      const relativeHref = titleLink.attr("href") ?? "";
      if (titleText === "" || relativeHref === "") {
        return;
      }
      const idMatch = relativeHref.match(/\/(\d+)-/);
      const numericId = idMatch?.[1] ?? relativeHref.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const summaryText = cardSelection
        .find(".teaser__text-inner p")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const locationRaw = cardSelection
        .find(".teaser__region .icon-text__text")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const postedAttr = cardSelection.find(".icon-text--start time").first().attr("datetime") ?? "";
      const closingAttr = cardSelection.find(".icon-text--expiry time").first().attr("datetime") ?? "";
      const postedDate = parseActivelinkDate(postedAttr);
      const closingDate = closingAttr === "" ? postedDate : parseActivelinkDate(closingAttr);
      const categoryTexts: string[] = [];
      cardSelection.find(".category-list__item a").each((_tagIndex, tagElement) => {
        const tagText = cheerioRoot(tagElement).text().replace(/\s+/g, " ").trim();
        if (tagText !== "") {
          categoryTexts.push(tagText);
        }
      });
      if (isExcludedActivelinkListing(extractActivelinkSection(relativeHref), titleText, categoryTexts)) {
        return;
      }
      const categoryText = categoryTexts[0] ?? "";
      const organisation = extractOrganisationFromActivelinkTitle(
        titleText,
        categoryText === "" ? "Community role" : categoryText,
      );
      const jobId = `activelink-${numericId}`;
      collectedJobs.push({
        id: jobId,
        source: "activelink",
        title: titleText,
        url: `${ACTIVELINK_ORIGIN}${relativeHref}`,
        organisation,
        locationRaw: locationRaw === "" ? "Ireland" : locationRaw,
        summary: summaryText,
        postedDate,
        closingDate,
        workMode: detectWorkMode(locationRaw, titleText, summaryText),
        hidden: false,
        salary: "",
      });
    });
    if (collectedJobs.length >= MAX_JOBS_PER_SOURCE) {
      break;
    }
    await sleepMilliseconds(DELAY_BETWEEN_PAGES_MS);
  }
  await enrichActivelinkSalaries(collectedJobs, previousSalaries);
  return collectedJobs;
}

async function readHiddenIds(): Promise<Set<string>> {
  try {
    const hiddenFile = Bun.file(HIDDEN_CONFIG_PATH);
    const hiddenExists = await hiddenFile.exists();
    if (hiddenExists === false) {
      return new Set<string>();
    }
    const hiddenList = (await hiddenFile.json()) as string[];
    if (Array.isArray(hiddenList) === false) {
      console.warn("Hidden config is not a list, continuing with none hidden.");
      return new Set<string>();
    }
    return new Set(hiddenList);
  } catch (error) {
    console.warn("Could not read hidden config, continuing with none hidden.", error);
    return new Set<string>();
  }
}

const MIN_EXPECTED_JOBS = 50;

async function mainFetch(): Promise<void> {
  const boardUrls = await readBoardUrls();
  const previousSalaries = await readPreviousSalaries();
  const hiddenIds = await readHiddenIds();
  const [publicjobsJobs, activelinkJobs, roompricegenieJobs] = await Promise.all([
    fetchPublicjobsListings(boardUrls.publicjobs),
    fetchActivelinkListings(boardUrls.activelink, previousSalaries),
    fetchAshbyBoardListings("roompricegenie", "RoomPriceGenie", boardUrls.roompricegenie),
  ]);
  const combinedJobs: JobListing[] = [...publicjobsJobs, ...activelinkJobs, ...roompricegenieJobs].map((jobEntry) => ({
    ...jobEntry,
    hidden: hiddenIds.has(jobEntry.id),
  }));
  if (combinedJobs.length < MIN_EXPECTED_JOBS) {
    throw new Error(
      `Only ${combinedJobs.length} jobs fetched, expected at least ${MIN_EXPECTED_JOBS}. Refusing to overwrite ${OUTPUT_PAYLOAD_PATH} with a near-empty payload.`,
    );
  }
  combinedJobs.sort((firstJob, secondJob) => Date.parse(secondJob.postedDate) - Date.parse(firstJob.postedDate));
  const payload: JobsPayload = {
    generatedAt: new Date().toISOString(),
    sources: [
      { id: "publicjobs" as SourceId, label: "Publicjobs", boardUrl: boardUrls.publicjobs },
      { id: "activelink" as SourceId, label: "Activelink", boardUrl: boardUrls.activelink },
      { id: "roompricegenie" as SourceId, label: "RoomPriceGenie", boardUrl: boardUrls.roompricegenie },
    ],
    jobs: combinedJobs,
  };
  await Bun.write(OUTPUT_PAYLOAD_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${combinedJobs.length} jobs to ${OUTPUT_PAYLOAD_PATH}`);
}

if (import.meta.main) {
  await mainFetch();
}
