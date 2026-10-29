import * as cheerio from "cheerio";
import { asSafeHttpUrl, resolveBoardUrl } from "../src/urls";
import { detectWorkMode } from "../src/workMode";
import type { JobListing, JobsPayload, SourceId, WorkMode } from "../src/types";

interface SourceConfig {
  id: SourceId;
  label: string;
  boardUrl: string;
}

const SOURCES_CONFIG_PATH = "config/sources.json";
const ACTIVELINK_ORIGIN = "https://www.activelink.ie";

export const DEFAULT_BOARD_URLS: Record<SourceId, string> = {
  publicjobs:
    "https://publicjobs.tal.net/vx/lang-en-GB/mobile-0/appcentre-ext/brand-4/xf-7ecb593daca6/candidate/jobboard/vacancy/3/adv/",
  activelink: "https://www.activelink.ie/vacancies",
  roompricegenie: "https://roompricegenie.com/careers/#jobs",
  pokemon: "https://job-boards.greenhouse.io/pokemoncareers",
  drcc: "https://www.drcc.ie/about/vacancies/",
  rise: "https://risecounselling.ie/vacancies/",
  tem: "https://jobs.ashbyhq.com/tem",
  feeld: "https://feeld.co/careers",
  reap: "https://careers.reap.global/jobs",
  coder: "https://jobs.ashbyhq.com/Coder",
  coreweave: "https://www.coreweave.com/careers/eu",
  upheal: "https://www.upheal.io/careers",
  aware: "https://www.aware.ie/get-involved/workwithus/",
  pieta: "https://www.pieta.ie/careers/#positions",
};

type BoardUrlSet = Record<SourceId, string>;

async function readBoardUrls(): Promise<BoardUrlSet> {
  try {
    const configFile = Bun.file(SOURCES_CONFIG_PATH);
    if ((await configFile.exists()) === false) {
      return { ...DEFAULT_BOARD_URLS };
    }
    const configuredSources = (await configFile.json()) as SourceConfig[];
    if (Array.isArray(configuredSources) === false) {
      return { ...DEFAULT_BOARD_URLS };
    }
    const resolvedUrls: BoardUrlSet = { ...DEFAULT_BOARD_URLS };
    for (const sourceEntry of configuredSources) {
      if (sourceEntry.id in DEFAULT_BOARD_URLS && typeof sourceEntry.boardUrl === "string" && sourceEntry.boardUrl !== "") {
        resolvedUrls[sourceEntry.id] = sourceEntry.boardUrl;
      }
    }
    return resolvedUrls;
  } catch (error) {
    console.warn(`Could not read ${SOURCES_CONFIG_PATH}, using fallback board URLs.`, error);
    return { ...DEFAULT_BOARD_URLS };
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

function collectJobsCapped<T>(items: Iterable<T>, mapItem: (item: T) => JobListing | null): JobListing[] {
  const collectedJobs: JobListing[] = [];
  for (const item of items) {
    const listing = mapItem(item);
    if (listing !== null) {
      collectedJobs.push(listing);
    }
    if (collectedJobs.length >= MAX_JOBS_PER_SOURCE) {
      break;
    }
  }
  return collectedJobs;
}

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
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function sleepMilliseconds(delayMs: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, delayMs);
  });
}

async function fetchTextWithTimeout(pageUrl: string): Promise<string> {
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

async function scrapeBoardListings(
  boardName: string,
  boardUrl: string,
  parsePage: (html: string, boardUrl: string) => JobListing[] | Promise<JobListing[]>,
): Promise<JobListing[]> {
  console.log(`Fetching ${boardName}`);
  const html = await fetchTextWithTimeout(boardUrl);
  const jobs = await parsePage(html, boardUrl);
  if (jobs.length === 0) {
    console.log(`${boardName} returned no parseable vacancies — site may have changed or no current openings.`);
  }
  return jobs;
}

export function readElementText(selection: { first(): { text(): string } }): string {
  return selection.first().text().replace(/\s+/g, " ").trim();
}

function normalizeText(rawText: string | null | undefined): string {
  return (rawText ?? "").replace(/\s+/g, " ").trim();
}

export function slugify(rawText: string, maxLength = 0): string {
  const dashedText = rawText.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (maxLength <= 0 || dashedText.length <= maxLength) {
    return dashedText;
  }
  const truncatedText = dashedText.slice(0, maxLength);
  const lastSeparatorIndex = truncatedText.lastIndexOf("-");
  return lastSeparatorIndex > 0 ? truncatedText.slice(0, lastSeparatorIndex) : truncatedText;
}

interface JobListingFields {
  id: string;
  source: SourceId;
  title: string;
  url: string;
  organisation: string;
  locationRaw: string;
  summary: string;
  postedDate: string;
  closingDate?: string;
  salary?: string;
  workMode?: WorkMode;
}

export function buildJobListing(fields: JobListingFields): JobListing {
  return {
    hidden: false,
    closingDate: "",
    salary: "",
    ...fields,
    workMode: fields.workMode ?? detectWorkMode(fields.locationRaw, fields.title, fields.summary),
  };
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedAttr)) {
    return parseIsoDateOrNow(`${trimmedAttr}T09:00:00.000Z`);
  }
  return parseIsoDateOrNow(trimmedAttr);
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

async function readPreviousPayloadJobs(): Promise<JobListing[]> {
  try {
    const payloadFile = Bun.file(OUTPUT_PAYLOAD_PATH);
    if ((await payloadFile.exists()) === false) {
      return [];
    }
    const previousPayload = (await payloadFile.json()) as JobsPayload;
    if (Array.isArray(previousPayload.jobs) === false) {
      return [];
    }
    return previousPayload.jobs;
  } catch (error) {
    console.warn("Could not read previous jobs payload, refetching all.", error);
    return [];
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
        const detailHtml = await fetchTextWithTimeout(jobEntry.url);
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
  tem: "tem",
  coder: "Coder",
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
  const titleText = normalizeText(posting.title);
  const detailUrl = (posting.jobUrl ?? "").trim();
  if (postingId === "" || titleText === "" || detailUrl === "") {
    return null;
  }
  const locationParts = [posting.location, ...(posting.secondaryLocations ?? []).map((entry) => entry.location)]
    .map(normalizeText)
    .filter((part) => part !== "");
  const locationRaw = locationParts.length > 0 ? [...new Set(locationParts)].join("; ") : "Remote";
  const summaryParts = [posting.team, posting.department, posting.employmentType]
    .map(normalizeText)
    .filter((part) => part !== "");
  const summaryText = [...new Set(summaryParts)].join(" · ");
  const safeUrl = asSafeHttpUrl(detailUrl, "");
  if (safeUrl === "") {
    return null;
  }
  const postedDate = parseIsoDateOrNow(posting.publishedAt ?? "");
  return buildJobListing({
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
    salary: normalizeText(posting.compensationTierSummary),
  });
}

export function parseIsoDateOrNow(rawDate: string): string {
  const trimmedValue = rawDate.trim();
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
  const responseText = await fetchTextWithTimeout(apiUrl);
  let payload: { jobs?: AshbyJobPosting[] };
  try {
    payload = JSON.parse(responseText) as { jobs?: AshbyJobPosting[] };
  } catch {
    throw new Error(`Ashby API for ${source} did not return JSON (${apiUrl}). The board may have moved; check ${boardUrl}.`);
  }
  if (Array.isArray(payload.jobs) === false) {
    throw new Error(`Ashby API for ${source} returned no job list (${apiUrl}). The board markup or API may have changed.`);
  }
  const collectedJobs = collectJobsCapped(payload.jobs ?? [], (posting) =>
    mapAshbyPostingToListing(posting, source, organisation),
  );
  if (collectedJobs.length === 0) {
    throw new Error(`Ashby API for ${source} returned no usable listings (${apiUrl}).`);
  }
  return collectedJobs;
}

const GREENHOUSE_API_URL = "https://boards-api.greenhouse.io/v1/boards";

export interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  updated_at: string;
  first_published: string;
}

export function mapGreenhouseJobToListing(
  job: GreenhouseJob,
  source: SourceId,
  organisation: string,
): JobListing | null {
  const jobId = String(job.id).trim();
  const titleText = normalizeText(job.title);
  const detailUrl = (job.absolute_url ?? "").trim();
  if (jobId === "" || titleText === "" || detailUrl === "") {
    return null;
  }
  const safeUrl = asSafeHttpUrl(detailUrl, "");
  if (safeUrl === "") {
    return null;
  }
  const locationRaw = normalizeText(job.location?.name) || "Remote";
  const postedDate = parseIsoDateOrNow(job.first_published ?? job.updated_at ?? "");
  return buildJobListing({
    id: `${source}-${jobId.slice(0, 8)}`,
    source,
    title: titleText,
    url: safeUrl,
    organisation,
    locationRaw,
    summary: organisation,
    postedDate,
    closingDate: postedDate,
    workMode: detectWorkMode(locationRaw, titleText, ""),
  });
}

export async function fetchGreenhouseBoardListings(
  source: SourceId,
  organisation: string,
  boardUrl: string,
): Promise<JobListing[]> {
  const boardSlug = source === "pokemon" ? "pokemoncareers" : source;
  const apiUrl = `${GREENHOUSE_API_URL}/${boardSlug}/jobs`;
  console.log(`Fetching ${source} jobs from Greenhouse API`);
  const responseText = await fetchTextWithTimeout(apiUrl);
  let payload: { jobs?: GreenhouseJob[] };
  try {
    payload = JSON.parse(responseText) as { jobs?: GreenhouseJob[] };
  } catch {
    throw new Error(`Greenhouse API for ${source} did not return JSON (${apiUrl}). The board may have moved; check ${boardUrl}.`);
  }
  if (Array.isArray(payload.jobs) === false) {
    throw new Error(`Greenhouse API for ${source} returned no job list (${apiUrl}).`);
  }
  const collectedJobs = collectJobsCapped(payload.jobs ?? [], (job) =>
    mapGreenhouseJobToListing(job, source, organisation),
  );
  if (collectedJobs.length === 0) {
    throw new Error(`Greenhouse API for ${source} returned no usable listings (${apiUrl}).`);
  }
  return collectedJobs;
}

export function parseDrccPage(html: string, boardUrl: string): JobListing[] {
  const root = cheerio.load(html);
  const jobs: JobListing[] = [];
  const contentText = root("#content").text();
  const salaryMatch = contentText.match(/Salary:\s*€([\d,]+)/i);
  const salary = salaryMatch?.[1] ? `€${salaryMatch[1]} per annum` : "";
  const locationMatch = contentText.match(/Location:\s*([^.]+)/i);
  const locationRaw = locationMatch?.[1]?.replace(/\s+/g, " ").trim() || "Dublin";
  const deadlineMatch = contentText.match(/(\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})\s*@\s*COB/i);
  const closingText = deadlineMatch?.[1]?.replace(/(st|nd|rd|th)/g, "").trim() ?? "";
  const closingDate = parsePublicjobsDate(closingText);
  const seenTitles = new Set<string>();
  root("h3").each((_i, el) => {
    const h3Text = readElementText(root(el));
    if (h3Text === "" || seenTitles.has(h3Text.toLowerCase())) {
      return;
    }
    const isJobTitle = /(?:Crisis Support|Counsellor|Therapist|Coordinator|Manager|Officer|Administrator|Assistant|Worker|Advocate|Specialist)/i.test(h3Text);
    if (!isJobTitle) {
      return;
    }
    seenTitles.add(h3Text.toLowerCase());
    const linkEl = root(el).find("a").first();
    const href = linkEl.attr("href") ?? "";
    const jobUrl = href !== "" ? new URL(href, boardUrl).toString() : boardUrl;
    jobs.push(
      buildJobListing({
        id: `drcc-${slugify(h3Text, 40)}`,
        source: "drcc",
        title: h3Text,
        url: jobUrl,
        organisation: "Dublin Rape Crisis Centre",
        locationRaw,
        summary: `Dublin Rape Crisis Centre · ${locationRaw}`,
        postedDate: closingDate,
        closingDate,
        salary,
      }),
    );
  });
  return jobs;
}

export async function fetchDrccListings(boardUrl: string): Promise<JobListing[]> {
  return scrapeBoardListings("DRCC vacancies page", boardUrl, parseDrccPage);
}

export function parseRisePage(html: string, boardUrl: string): JobListing[] {
  const root = cheerio.load(html);
  const jobs: JobListing[] = [];
  const contentHtml = root(".bde-rich-text-396-105, .bde-rich-text").html() ?? "";
  const linkPattern = /href="([^"]*\.pdf[^"]*)"[^>]*><strong>([^<]+)<\/strong>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(contentHtml)) !== null) {
    const pdfHref = match[1] ?? "";
    const rawTitle = (match[2] ?? "").replace(/\s+/g, " ").trim();
    const titleMatch = rawTitle.match(/^(.*?)(?:\s*€[\d,]+(?:\s*per session)?)?(?:\s*\(closing date[^)]*\))?$/i);
    const title = titleMatch?.[1]?.trim() ?? rawTitle;
    const salaryMatch = rawTitle.match(/€([\d,]+(?:\s*per\s*\w+)?)/i);
    const salary = salaryMatch?.[0] ?? "";
    const closingMatch = rawTitle.match(/closing date\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)[\s,]*(\d{4})/i);
    const closingText = closingMatch ? `${closingMatch[1]} ${closingMatch[2]} ${closingMatch[3]}` : "";
    const closingDate = parsePublicjobsDate(closingText);
    const jobUrl = pdfHref.startsWith("http") ? pdfHref : new URL(pdfHref, boardUrl).toString();
    const locationRaw = "Kilcoole, Co. Wicklow";
    jobs.push(
      buildJobListing({
        id: `rise-${slugify(title, 40)}`,
        source: "rise",
        title,
        url: jobUrl,
        organisation: "RISE Counselling",
        locationRaw,
        summary: `RISE Counselling · ${locationRaw}`,
        postedDate: closingDate,
        closingDate,
        salary,
      }),
    );
  }
  return jobs;
}

export async function fetchRiseListings(boardUrl: string): Promise<JobListing[]> {
  return scrapeBoardListings("RISE Counselling vacancies page", boardUrl, parseRisePage);
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
    const pageHtml = await fetchTextWithTimeout(pageUrl);
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
      const titleText = readElementText(titleLink);
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
      const postedDate = parsePublicjobsDate(advertisingText);
      const closingDate = closingText === "" ? postedDate : parsePublicjobsDate(closingText);
      const summaryText = vacancyType === "" ? organisation : `${vacancyType} at ${organisation}`;
      collectedJobs.push(
        buildJobListing({
          id: `publicjobs-${opportunityId}`,
          source: "publicjobs",
          title: titleText,
          url: resolvePublicjobsUrl(detailHref, boardUrl),
          organisation: organisation === "" ? "Publicjobs role" : organisation,
          locationRaw: locationRaw === "" ? "Ireland" : locationRaw,
          summary: summaryText,
          postedDate,
          closingDate,
        }),
      );
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
    const pageHtml = await fetchTextWithTimeout(pageUrl);
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
      const titleText = readElementText(titleLink.find(".field--name-title"));
      const relativeHref = titleLink.attr("href") ?? "";
      if (titleText === "" || relativeHref === "") {
        return;
      }
      const idMatch = relativeHref.match(/\/(\d+)-/);
      const numericId = idMatch?.[1] ?? relativeHref.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const summaryText = readElementText(cardSelection.find(".teaser__text-inner p"));
      const locationRaw = readElementText(cardSelection.find(".teaser__region .icon-text__text"));
      const postedAttr = cardSelection.find(".icon-text--start time").first().attr("datetime") ?? "";
      const closingAttr = cardSelection.find(".icon-text--expiry time").first().attr("datetime") ?? "";
      const postedDate = parseActivelinkDate(postedAttr);
      const closingDate = closingAttr === "" ? postedDate : parseActivelinkDate(closingAttr);
      const categoryTexts: string[] = [];
      cardSelection.find(".category-list__item a").each((_tagIndex, tagElement) => {
        const tagText = readElementText(cheerioRoot(tagElement));
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
      collectedJobs.push(
        buildJobListing({
          id: `activelink-${numericId}`,
          source: "activelink",
          title: titleText,
          url: `${ACTIVELINK_ORIGIN}${relativeHref}`,
          organisation,
          locationRaw: locationRaw === "" ? "Ireland" : locationRaw,
          summary: summaryText,
          postedDate,
          closingDate,
        }),
      );
    });
    if (collectedJobs.length >= MAX_JOBS_PER_SOURCE) {
      break;
    }
    await sleepMilliseconds(DELAY_BETWEEN_PAGES_MS);
  }
  await enrichActivelinkSalaries(collectedJobs, previousSalaries);
  return collectedJobs;
}

function stripHtmlTags(html: string): string {
  return cheerio.load(html.replace(/<[^>]+>/g, " ")).text().replace(/\s+/g, " ").trim();
}

export async function fetchReapListings(boardUrl: string): Promise<JobListing[]> {
  const apiUrl = "https://careers.reap.global/jobs.json";
  console.log(`Fetching Reap jobs from ${apiUrl}`);
  const responseText = await fetchTextWithTimeout(apiUrl);
  let payload: { items?: Array<{ id?: string; title?: string; url?: string; date_published?: string; content_html?: string }> };
  try {
    payload = JSON.parse(responseText) as typeof payload;
  } catch {
    throw new Error(`Reap API did not return JSON (${apiUrl}). The feed may have moved; check ${boardUrl}.`);
  }
  if (Array.isArray(payload.items) === false || payload.items.length === 0) {
    throw new Error(`Reap API returned no items (${apiUrl}).`);
  }
  const collectedJobs: JobListing[] = [];
  for (const item of payload.items) {
    if (!item.title || !item.url) {
      continue;
    }
    const description = item.content_html ? stripHtmlTags(item.content_html) : "";
    const salaryMatch = description.match(/(?:salary|compensation)[:\s]*([€£$][\d,.\s-]+(?:per\s+(?:annum|month|hour|year))?)/i);
    collectedJobs.push(
      buildJobListing({
        id: `reap-${item.id ?? item.url.split("/").pop() ?? Date.now()}`,
        source: "reap",
        title: item.title,
        url: item.url,
        organisation: "",
        locationRaw: "",
        summary: description,
        salary: salaryMatch?.[1] ?? "",
        postedDate: parseIsoDateOrNow(item.date_published ?? ""),
        workMode: "onsite",
      }),
    );
    if (collectedJobs.length >= MAX_JOBS_PER_SOURCE) {
      break;
    }
  }
  if (collectedJobs.length === 0) {
    throw new Error(`Reap API returned no usable listings (${apiUrl}).`);
  }
  return collectedJobs;
}

export async function fetchFeeldListings(boardUrl: string): Promise<JobListing[]> {
  console.log(`Fetching Feeld jobs from ${boardUrl}`);
  const html = await fetchTextWithTimeout(boardUrl);
  const root = cheerio.load(html);
  const jobUrls: string[] = [];
  root("a[href*='feeldco.workable.com/jobs/']").each((_index, element) => {
    const href = root(element).attr("href") ?? "";
    if (href && !jobUrls.includes(href)) {
      jobUrls.push(href);
    }
  });
  if (jobUrls.length === 0) {
    throw new Error(`Feeld page returned no usable listings (${boardUrl}).`);
  }
  const collectedJobs: JobListing[] = [];
  for (const jobUrl of jobUrls) {
    if (collectedJobs.length >= MAX_JOBS_PER_SOURCE) {
      break;
    }
    try {
      const detailHtml = await fetchTextWithTimeout(jobUrl);
      const titleMatch = detailHtml.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
      const title = titleMatch?.[1]?.replace(/ - Feeld$/, "").trim() ?? "";
      if (!title) {
        continue;
      }
      const descMatch = detailHtml.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
      const description = descMatch?.[1] ?? "";
      collectedJobs.push(
        buildJobListing({
          id: `feeld-${jobUrl.split("/").pop() ?? Date.now()}`,
          source: "feeld",
          title,
          url: jobUrl,
          organisation: "",
          locationRaw: "",
          summary: description,
          postedDate: new Date().toISOString(),
          workMode: "onsite",
        }),
      );
    } catch (error) {
      console.warn(`Could not fetch Feeld detail page ${jobUrl}`, error);
    }
    await sleepMilliseconds(DELAY_BETWEEN_PAGES_MS);
  }
  if (collectedJobs.length === 0) {
    throw new Error(`Feeld page returned no usable listings (${boardUrl}).`);
  }
  return collectedJobs;
}

const COREWEAVE_ALLOWED_LOCATIONS = ["dublin", "ireland", "emea", "europe"];

export async function fetchCoreweaveListings(
  source: SourceId,
  organisation: string,
  boardUrl: string,
): Promise<JobListing[]> {
  const apiUrl = `${GREENHOUSE_API_URL}/coreweaveu/jobs`;
  console.log(`Fetching CoreWeave jobs from Greenhouse API`);
  const responseText = await fetchTextWithTimeout(apiUrl);
  let payload: { jobs?: GreenhouseJob[] };
  try {
    payload = JSON.parse(responseText) as { jobs?: GreenhouseJob[] };
  } catch {
    throw new Error(`CoreWeave API did not return JSON (${apiUrl}). The board may have moved; check ${boardUrl}.`);
  }
  if (Array.isArray(payload.jobs) === false) {
    throw new Error(`CoreWeave API returned no job list (${apiUrl}).`);
  }
  const collectedJobs = collectJobsCapped(payload.jobs ?? [], (job) => {
    const locationName = (job.location?.name ?? "").toLowerCase();
    const isAllowed = COREWEAVE_ALLOWED_LOCATIONS.some((allowed) => locationName.includes(allowed));
    if (!isAllowed) {
      return null;
    }
    return mapGreenhouseJobToListing(job, source, organisation);
  });
  if (collectedJobs.length === 0) {
    throw new Error(`CoreWeave API returned no Ireland/EMEA listings (${apiUrl}).`);
  }
  return collectedJobs;
}

const UPHEAL_SITEMAP_URL = "https://www.upheal.io/sitemap.xml";

function normalizeUrlForLookup(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, "");
}

async function fetchSitemapLastModified(sitemapUrl: string): Promise<Map<string, string>> {
  const lastModifiedByUrl = new Map<string, string>();
  try {
    const sitemapXml = await fetchTextWithTimeout(sitemapUrl);
    const sitemapRoot = cheerio.load(sitemapXml, { xmlMode: true });
    sitemapRoot("url").each((_index, urlElement) => {
      const urlSelection = sitemapRoot(urlElement);
      const pageUrl = urlSelection.find("loc").first().text().trim();
      const lastModified = urlSelection.find("lastmod").first().text().trim();
      if (pageUrl !== "" && lastModified !== "") {
        lastModifiedByUrl.set(normalizeUrlForLookup(pageUrl), lastModified);
      }
    });
  } catch (error) {
    console.warn(`Could not read sitemap ${sitemapUrl}, using fetch time for posted dates.`, error);
  }
  return lastModifiedByUrl;
}

export function parseUphealPage(
  html: string,
  boardUrl: string,
  postedDates: Map<string, string> = new Map<string, string>(),
): JobListing[] {
  const root = cheerio.load(html);
  const jobs: JobListing[] = [];
  const seenUrls = new Set<string>();
  root(".uui-career06_list-wrapper .collection-item").each((_index, element) => {
    const card = root(element);
    const title = readElementText(card.find(".uui-career06_heading"));
    const href = card.find(".uui-button-wrapper-2 a").first().attr("href") ?? "";
    if (title === "" || href === "") {
      return;
    }
    const jobUrl = resolveBoardUrl(href, boardUrl);
    if (seenUrls.has(jobUrl)) {
      return;
    }
    seenUrls.add(jobUrl);
    const department = readElementText(card.find(".uui-badge"));
    const detailTexts: string[] = [];
    card.find(".uui-career06_detail-wrapper").each((_detailIndex, detailElement) => {
      const detailText = readElementText(root(detailElement));
      if (detailText !== "") {
        detailTexts.push(detailText);
      }
    });
    const locationRaw = detailTexts[0] ?? "Remote";
    const employmentType = detailTexts[1] ?? "";
    const summaryParts = [department, employmentType].filter((part) => part !== "");
    const summary = summaryParts.length > 0 ? summaryParts.join(" · ") : "Upheal";
    const normalizedUrl = normalizeUrlForLookup(jobUrl);
    const slug = normalizedUrl.split("/").pop() ?? slugify(title);
    const postedDate = parseIsoDateOrNow(postedDates.get(normalizedUrl) ?? "");
    jobs.push(
      buildJobListing({
        id: `upheal-${slug}`,
        source: "upheal",
        title,
        url: jobUrl,
        organisation: "Upheal",
        locationRaw,
        summary,
        postedDate,
      }),
    );
  });
  return jobs;
}

export async function fetchUphealListings(boardUrl: string): Promise<JobListing[]> {
  const postedDatesPromise = fetchSitemapLastModified(UPHEAL_SITEMAP_URL);
  return scrapeBoardListings("Upheal careers", boardUrl, async (html, url) =>
    parseUphealPage(html, url, await postedDatesPromise),
  );
}

export interface PietaJobDetail {
  locationRaw: string;
  positionType: string;
  salary: string;
  closingDate: string;
}

export function parsePietaClosingDate(rawText: string): string {
  const closingMatch = rawText.match(/Closing Date:\s*([^<]{0,80})/i);
  const dateMatch = closingMatch?.[1]?.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]+)\s*,?\s*(\d{4})/i);
  if (dateMatch === null || dateMatch === undefined) {
    return "";
  }
  return parsePublicjobsDate(`${dateMatch[1] ?? ""} ${dateMatch[2] ?? ""} ${dateMatch[3] ?? ""}`);
}

export function parsePietaDetail(html: string): PietaJobDetail {
  const root = cheerio.load(html);
  const infoByLabel = new Map<string, string>();
  root(".career_overview__info_row").each((_index, rowElement) => {
    const row = root(rowElement);
    const label = readElementText(row.find(".career_overview__info_label"))
      .replace(/:$/, "")
      .toLowerCase();
    const value = readElementText(row.find(".career_overview__info_value"));
    if (label !== "" && value !== "") {
      infoByLabel.set(label, value);
    }
  });
  const closingDate = parsePietaClosingDate(readElementText(root(".block_careers_detail")));
  return {
    locationRaw: infoByLabel.get("location") ?? "",
    positionType: infoByLabel.get("position type") ?? "",
    salary: infoByLabel.get("salary") ?? "",
    closingDate,
  };
}

export function parsePietaPage(html: string, boardUrl: string): JobListing[] {
  const root = cheerio.load(html);
  const jobs: JobListing[] = [];
  const seenIds = new Set<string>();
  root(".block_open_positions__tab[data-tab='all'] .career_preview").each((_index, element) => {
    const card = root(element);
    const title = readElementText(card.find(".career_preview__heading"));
    const href = card.attr("href") ?? "";
    if (title === "" || href === "") {
      return;
    }
    const jobUrl = resolveBoardUrl(href, boardUrl);
    const slug = normalizeUrlForLookup(jobUrl).split("/").pop() ?? slugify(title);
    if (seenIds.has(slug)) {
      return;
    }
    seenIds.add(slug);
    const excerpt = readElementText(card.find(".career_preview__excerpt"));
    const labels: string[] = [];
    card.find(".career_preview__labels .label").each((_labelIndex, labelElement) => {
      const labelText = readElementText(root(labelElement));
      if (labelText !== "") {
        labels.push(labelText);
      }
    });
    const locationRaw = labels[0] ?? "Ireland";
    const category = labels[1] ?? "";
    const summary = excerpt !== "" ? excerpt : category === "" ? "Pieta" : category;
    jobs.push(
      buildJobListing({
        id: `pieta-${slug}`,
        source: "pieta",
        title,
        url: jobUrl,
        organisation: "Pieta",
        locationRaw,
        summary,
        postedDate: new Date().toISOString(),
      }),
    );
  });
  return jobs;
}

export async function fetchPietaListings(
  boardUrl: string,
  previousPostedDates: Map<string, string> = new Map<string, string>(),
): Promise<JobListing[]> {
  console.log(`Fetching Pieta careers from ${boardUrl}`);
  const html = await fetchTextWithTimeout(boardUrl);
  const jobs = parsePietaPage(html, boardUrl);
  for (const job of jobs) {
    job.postedDate = previousPostedDates.get(job.id) ?? job.postedDate;
    try {
      const detailHtml = await fetchTextWithTimeout(job.url);
      const detail = parsePietaDetail(detailHtml);
      if (detail.locationRaw !== "") {
        job.locationRaw = detail.locationRaw;
      }
      if (detail.salary !== "") {
        job.salary = detail.salary;
      }
      if (detail.closingDate !== "") {
        job.closingDate = detail.closingDate;
      }
      if (job.summary === "Pieta" && detail.positionType !== "") {
        job.summary = detail.positionType;
      }
      job.workMode = detectWorkMode(job.locationRaw, job.title, job.summary);
    } catch (error) {
      console.warn(`Could not fetch Pieta details for ${job.id}, leaving salary empty.`, error);
    }
    await sleepMilliseconds(DELAY_BETWEEN_PAGES_MS);
  }
  if (jobs.length === 0) {
    console.log("Pieta page returned no parseable vacancies — site may have changed or no current openings.");
  }
  return jobs;
}

const AWARE_ROLE_LOCATIONS: Record<string, string> = {
  "#SOLACE": "Dublin 4 or remote",
  "#TP": "Nationwide",
  "#MHP": "Nationwide",
};

export function parseAwareModifiedDate(html: string): string {
  const modifiedMatch =
    html.match(/<meta[^>]*property=["']article:modified_time["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']article:modified_time["']/i);
  return parseIsoDateOrNow(modifiedMatch?.[1] ?? "");
}

export function parseAwarePage(html: string, boardUrl: string): JobListing[] {
  const root = cheerio.load(html);
  const postedDate = parseAwareModifiedDate(html);
  const jobs: JobListing[] = [];
  root("a.elementor-cta").each((_index, element) => {
    const card = root(element);
    const href = card.attr("href") ?? "";
    const title = readElementText(card.find(".elementor-cta__title"));
    if (href === "" || title === "") {
      return;
    }
    const descriptionHtml = card.find(".elementor-cta__description").first().html() ?? "";
    const description = cheerio
      .load(`<div>${descriptionHtml.replace(/<br\s*\/?>/gi, " ")}</div>`)("div")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const locationRaw = AWARE_ROLE_LOCATIONS[href] ?? "Nationwide";
    jobs.push(
      buildJobListing({
        id: `aware-${slugify(title)}`,
        source: "aware",
        title,
        url: resolveBoardUrl(href, boardUrl),
        organisation: "Aware",
        locationRaw,
        summary: description === "" ? "Counselling Service" : description,
        postedDate,
      }),
    );
  });
  return jobs;
}

export async function fetchAwareListings(boardUrl: string): Promise<JobListing[]> {
  return scrapeBoardListings("Aware work-with-us page", boardUrl, parseAwarePage);
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

const MIN_EXPECTED_JOBS = 80;

interface FetchContext {
  boardUrls: BoardUrlSet;
  previousSalaries: Map<string, string>;
  previousPostedDates: Map<string, string>;
}

interface SourceDefinition {
  label: string;
  fetchJobs: (context: FetchContext) => Promise<JobListing[]>;
}

const SOURCE_REGISTRY: Record<SourceId, SourceDefinition> = {
  publicjobs: { label: "Publicjobs", fetchJobs: ({ boardUrls }) => fetchPublicjobsListings(boardUrls.publicjobs) },
  activelink: {
    label: "Activelink",
    fetchJobs: ({ boardUrls, previousSalaries }) => fetchActivelinkListings(boardUrls.activelink, previousSalaries),
  },
  roompricegenie: {
    label: "RoomPriceGenie",
    fetchJobs: ({ boardUrls }) => fetchAshbyBoardListings("roompricegenie", "RoomPriceGenie", boardUrls.roompricegenie),
  },
  pokemon: {
    label: "Pokemon",
    fetchJobs: ({ boardUrls }) => fetchGreenhouseBoardListings("pokemon", "The Pokémon Company International", boardUrls.pokemon),
  },
  drcc: { label: "DRCC", fetchJobs: ({ boardUrls }) => fetchDrccListings(boardUrls.drcc) },
  rise: { label: "RISE Counselling", fetchJobs: ({ boardUrls }) => fetchRiseListings(boardUrls.rise) },
  tem: { label: "Tem", fetchJobs: ({ boardUrls }) => fetchAshbyBoardListings("tem", "Tem", boardUrls.tem) },
  feeld: { label: "Feeld", fetchJobs: ({ boardUrls }) => fetchFeeldListings(boardUrls.feeld) },
  reap: { label: "Reap", fetchJobs: ({ boardUrls }) => fetchReapListings(boardUrls.reap) },
  coder: { label: "Coder", fetchJobs: ({ boardUrls }) => fetchAshbyBoardListings("coder", "Coder", boardUrls.coder) },
  coreweave: {
    label: "CoreWeave",
    fetchJobs: ({ boardUrls }) => fetchCoreweaveListings("coreweave", "CoreWeave", boardUrls.coreweave),
  },
  upheal: { label: "Upheal", fetchJobs: ({ boardUrls }) => fetchUphealListings(boardUrls.upheal) },
  aware: { label: "Aware", fetchJobs: ({ boardUrls }) => fetchAwareListings(boardUrls.aware) },
  pieta: {
    label: "Pieta",
    fetchJobs: ({ boardUrls, previousPostedDates }) => fetchPietaListings(boardUrls.pieta, previousPostedDates),
  },
};

const SOURCE_IDS = Object.keys(SOURCE_REGISTRY) as SourceId[];

async function mainFetch(): Promise<void> {
  const boardUrls = await readBoardUrls();
  const previousJobs = await readPreviousPayloadJobs();
  const context: FetchContext = {
    boardUrls,
    previousSalaries: new Map(previousJobs.map((jobEntry) => [jobEntry.id, jobEntry.salary ?? ""])),
    previousPostedDates: new Map(previousJobs.map((jobEntry) => [jobEntry.id, jobEntry.postedDate])),
  };
  const hiddenIds = await readHiddenIds();
  const jobsBySource = await Promise.all(SOURCE_IDS.map((sourceId) => SOURCE_REGISTRY[sourceId].fetchJobs(context)));
  const combinedJobs: JobListing[] = jobsBySource.flat().map((jobEntry) => ({
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
    sources: SOURCE_IDS.map((sourceId) => ({
      id: sourceId,
      label: SOURCE_REGISTRY[sourceId].label,
      boardUrl: boardUrls[sourceId],
    })),
    jobs: combinedJobs,
  };
  await Bun.write(OUTPUT_PAYLOAD_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${combinedJobs.length} jobs to ${OUTPUT_PAYLOAD_PATH}`);
}

if (import.meta.main) {
  await mainFetch();
}
