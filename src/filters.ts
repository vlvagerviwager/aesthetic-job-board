import { KEYWORD_MIN_LENGTH } from "./constants";
import type { BoardFilters, JobListing } from "./types";

export function normalizeSearchText(rawText: string): string {
  return rawText
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function isEffectivelyHidden(job: JobListing, overrides: Record<string, boolean>): boolean {
  const overrideValue = overrides[job.id];
  if (typeof overrideValue === "boolean") {
    return overrideValue;
  }
  return job.hidden;
}

export function matchesKeyword(job: JobListing, keywordRaw: string): boolean {
  const trimmedKeyword = keywordRaw.trim();
  if (trimmedKeyword.length < KEYWORD_MIN_LENGTH) {
    return true;
  }
  const haystack = normalizeSearchText(
    `${job.title} ${job.organisation} ${job.summary} ${job.locationRaw} ${job.salary}`,
  );
  const searchTerms = normalizeSearchText(trimmedKeyword).split(/\s+/);
  return searchTerms.every((term) => term !== "" && haystack.includes(term));
}

export function matchesLocation(job: JobListing, selectedLocations: string[]): boolean {
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

export function matchesFilters(
  job: JobListing,
  filters: BoardFilters,
  overrides: Record<string, boolean>,
): boolean {
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

export function sortNewestFirst(jobList: JobListing[]): JobListing[] {
  const sortedJobs = [...jobList];
  sortedJobs.sort((firstJob, secondJob) => {
    const firstTime = Date.parse(firstJob.postedDate);
    const secondTime = Date.parse(secondJob.postedDate);
    return secondTime - firstTime;
  });
  return sortedJobs;
}
