import * as cheerio from "cheerio";
import { detectWorkMode } from "../src/workMode";
import type { JobListing, JobsPayload, SourceId } from "../src/types";

const PUBLICJOBS_BOARD_URL =
  "https://publicjobs.tal.net/vx/lang-en-GB/mobile-0/appcentre-ext/brand-4/xf-7ecb593daca6/candidate/jobboard/vacancy/3/adv/";
const ACTIVELINK_BOARD_URL = "https://www.activelink.ie/vacancies";
const ACTIVELINK_ORIGIN = "https://www.activelink.ie";

const REQUEST_TIMEOUT_MS = 25000;
const DELAY_BETWEEN_PAGES_MS = 350;
const PUBLICJOBS_PAGE_SIZE = 50;
const PUBLICJOBS_MAX_PAGES = 12;
const ACTIVELINK_MAX_PAGES = 18;
const MAX_JOBS_PER_SOURCE = 900;
const FIRST_PAGE_INDEX = 0;
const SECOND_PAGE_INDEX = 1;

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
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function cleanFieldText(rawText: string, labelToStrip: string): string {
  const withoutLabel = rawText.replace(labelToStrip, "");
  return withoutLabel.replace(/\s+/g, " ").trim();
}

function parsePublicjobsDate(dateText: string): string {
  const trimmedText = dateText.trim();
  const dateParts = trimmedText.split(/\s+/);
  if (dateParts.length < SECOND_PAGE_INDEX + 2) {
    return new Date().toISOString();
  }
  const dayPart = dateParts[0] ?? "";
  const monthPart = (dateParts[1] ?? "").toLowerCase();
  const yearPart = dateParts[2] ?? "";
  const monthNumber = MONTH_LOOKUP[monthPart] ?? "01";
  const paddedDay = dayPart.padStart(2, "0");
  return new Date(`${yearPart}-${monthNumber}-${paddedDay}T09:00:00.000Z`).toISOString();
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

function extractSalaryFromDetail(detailHtml: string): string {
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
    if ((hasSalaryLabel || startsWithSalary) && SALARY_CONTENT_PATTERN.test(elementText)) {
      return truncateSalaryText(elementText);
    }
  }
  return "";
}

async function enrichActivelinkSalaries(collectedJobs: JobListing[]): Promise<void> {
  for (let jobIndex = 0; jobIndex < collectedJobs.length; jobIndex += 1) {
    const jobEntry = collectedJobs[jobIndex];
    if (jobEntry === undefined) {
      continue;
    }
    if (jobIndex % DETAIL_PROGRESS_LOG_EVERY === 0) {
      console.log(`Fetching activelink details ${jobIndex + 1} of ${collectedJobs.length}`);
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
  const withSalary = collectedJobs.filter((jobEntry) => jobEntry.salary !== "").length;
  console.log(`Found salary text for ${withSalary} of ${collectedJobs.length} activelink roles`);
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

async function fetchPublicjobsListings(): Promise<JobListing[]> {
  const collectedJobs: JobListing[] = [];
  for (let pageIndex = FIRST_PAGE_INDEX; pageIndex < PUBLICJOBS_MAX_PAGES; pageIndex += 1) {
    const startOffset = pageIndex * PUBLICJOBS_PAGE_SIZE;
    const pageUrl = startOffset === 0 ? PUBLICJOBS_BOARD_URL : `${PUBLICJOBS_BOARD_URL}?start=${startOffset}`;
    console.log(`Fetching publicjobs page offset ${startOffset}`);
    const pageHtml = await fetchHtmlWithTimeout(pageUrl);
    const cheerioRoot = cheerio.load(pageHtml);
    const jobCards = cheerioRoot("li.opp-container");
    if (jobCards.length === 0) {
      break;
    }
    jobCards.each((_cardIndex, cardElement) => {
      const cardSelection = cheerioRoot(cardElement);
      const opportunityId = cardSelection.attr("data-oppid") ?? "";
      const titleLink = cardSelection.find("a.subject").first();
      const titleText = titleLink.text().replace(/\s+/g, " ").trim();
      const detailHref = titleLink.attr("href") ?? PUBLICJOBS_BOARD_URL;
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
        url: detailHref,
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

async function fetchActivelinkListings(): Promise<JobListing[]> {
  const collectedJobs: JobListing[] = [];
  for (let pageIndex = FIRST_PAGE_INDEX; pageIndex < ACTIVELINK_MAX_PAGES; pageIndex += 1) {
    const pageUrl = pageIndex === 0 ? ACTIVELINK_BOARD_URL : `${ACTIVELINK_BOARD_URL}?page=${pageIndex}`;
    console.log(`Fetching activelink page ${pageIndex}`);
    const pageHtml = await fetchHtmlWithTimeout(pageUrl);
    const cheerioRoot = cheerio.load(pageHtml);
    const teaserCards = cheerioRoot("article.teaser");
    if (teaserCards.length === 0) {
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
      const postedDate =
        postedAttr === "" ? new Date().toISOString() : new Date(`${postedAttr}T09:00:00.000Z`).toISOString();
      const closingDate = closingAttr === "" ? postedDate : new Date(`${closingAttr}T09:00:00.000Z`).toISOString();
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
  await enrichActivelinkSalaries(collectedJobs);
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
    return new Set(hiddenList);
  } catch (error) {
    console.warn("Could not read hidden config, continuing with none hidden.", error);
    return new Set<string>();
  }
}

async function mainFetch(): Promise<void> {
  const hiddenIds = await readHiddenIds();
  const [publicjobsJobs, activelinkJobs] = await Promise.all([fetchPublicjobsListings(), fetchActivelinkListings()]);
  const combinedJobs: JobListing[] = [...publicjobsJobs, ...activelinkJobs].map((jobEntry) => ({
    ...jobEntry,
    hidden: hiddenIds.has(jobEntry.id),
  }));
  combinedJobs.sort((firstJob, secondJob) => Date.parse(secondJob.postedDate) - Date.parse(firstJob.postedDate));
  const payload: JobsPayload = {
    generatedAt: new Date().toISOString(),
    sources: [
      { id: "publicjobs" as SourceId, label: "Publicjobs", boardUrl: PUBLICJOBS_BOARD_URL },
      { id: "activelink" as SourceId, label: "Activelink", boardUrl: ACTIVELINK_BOARD_URL },
    ],
    jobs: combinedJobs,
  };
  await Bun.write(OUTPUT_PAYLOAD_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${combinedJobs.length} jobs to ${OUTPUT_PAYLOAD_PATH}`);
}

await mainFetch();
