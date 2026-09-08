import { describe, expect, test } from "bun:test";
import {
  isEffectivelyHidden,
  matchesKeyword,
  matchesLocation,
  normalizeSearchText,
  paginateJobs,
  sortNewestFirst,
  titleMentionsOrganisation,
} from "./filters";
import type { JobListing } from "./types";

function makeJob(overrides: Partial<JobListing> = {}): JobListing {
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

describe("normalizeSearchText", () => {
  test("strips diacritics and lowercases", () => {
    expect(normalizeSearchText("Foróige GAEILGE")).toBe("foroige gaeilge");
  });
});

describe("matchesKeyword", () => {
  test("short queries match everything", () => {
    expect(matchesKeyword(makeJob(), "a")).toBe(true);
  });

  test("matches across fields including salary", () => {
    expect(matchesKeyword(makeJob(), "35,000")).toBe(true);
    expect(matchesKeyword(makeJob(), "foroige")).toBe(true);
  });

  test("requires every term (AND)", () => {
    expect(matchesKeyword(makeJob(), "youth dublin")).toBe(true);
    expect(matchesKeyword(makeJob(), "youth cork")).toBe(false);
  });

  test("matches regardless of term order", () => {
    expect(matchesKeyword(makeJob(), "worker youth")).toBe(true);
  });
});

describe("matchesLocation", () => {
  test("empty selection matches everything", () => {
    expect(matchesLocation(makeJob(), [])).toBe(true);
  });

  test("matches case-insensitively by substring", () => {
    expect(matchesLocation(makeJob(), ["dublin"])).toBe(true);
    expect(matchesLocation(makeJob(), ["Cork"])).toBe(false);
  });
});

describe("isEffectivelyHidden", () => {
  test("override wins over stored flag", () => {
    expect(isEffectivelyHidden(makeJob({ hidden: true }), { "publicjobs-1": false })).toBe(false);
    expect(isEffectivelyHidden(makeJob({ hidden: false }), { "publicjobs-1": true })).toBe(true);
  });

  test("falls back to stored flag", () => {
    expect(isEffectivelyHidden(makeJob({ hidden: true }), {})).toBe(true);
  });
});

describe("titleMentionsOrganisation", () => {
  test("detects org prefix despite accents and case", () => {
    expect(
      titleMentionsOrganisation(makeJob({ title: "Foróige: Club Development Officer" })),
    ).toBe(true);
  });

  test("returns false when the title stands alone", () => {
    expect(
      titleMentionsOrganisation(
        makeJob({ title: "Laboratory Manager", organisation: "Department of Agriculture" }),
      ),
    ).toBe(false);
  });
});

describe("paginateJobs", () => {
  test("slices to the visible count and reports the remainder", () => {
    const jobs = [makeJob({ id: "a" }), makeJob({ id: "b" }), makeJob({ id: "c" })];
    expect(paginateJobs(jobs, 2)).toEqual({ visibleJobs: jobs.slice(0, 2), remainingCount: 1 });
  });

  test("reports zero remaining when everything fits", () => {
    const jobs = [makeJob({ id: "a" })];
    expect(paginateJobs(jobs, 60)).toEqual({ visibleJobs: jobs, remainingCount: 0 });
  });

  test("clamps negative counts to an empty page", () => {
    expect(paginateJobs([makeJob({ id: "a" })], -5)).toEqual({ visibleJobs: [], remainingCount: 1 });
  });
});

describe("sortNewestFirst", () => {
  test("orders newest first without mutating input", () => {
    const older = makeJob({ id: "a", postedDate: "2026-08-01T09:00:00.000Z" });
    const newer = makeJob({ id: "b", postedDate: "2026-09-01T09:00:00.000Z" });
    const input = [older, newer];
    expect(sortNewestFirst(input).map((job) => job.id)).toEqual(["b", "a"]);
    expect(input[0]?.id).toBe("a");
  });
});
