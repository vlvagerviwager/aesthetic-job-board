import type { JobListing } from "../src/types";

export function makeJob(overrides: Partial<JobListing> = {}): JobListing {
  return {
    id: "publicjobs-1",
    source: "publicjobs",
    title: "Youth Worker",
    url: "https://example.com/1",
    organisation: "Foróige",
    locationRaw: "Dublin",
    summary: "Community role supporting young people",
    salary: "€35,000 per annum",
    postedDate: "2026-09-01T09:00:00.000Z",
    closingDate: "2026-09-30T09:00:00.000Z",
    workMode: "onsite",
    hidden: false,
    ...overrides,
  };
}
