import { describe, expect, test } from "bun:test";
import {
  extractSalaryFromDetail,
  mapAshbyPostingToListing,
  mapGreenhouseJobToListing,
  parseActivelinkDate,
  parseDrccPage,
  parsePublicjobsDate,
  parseRisePage,
  resolvePublicjobsUrl,
} from "./fetch-jobs";

describe("parsePublicjobsDate", () => {
  test("parses a standard board date", () => {
    expect(parsePublicjobsDate("08 Sep 2026")).toBe("2026-09-08T09:00:00.000Z");
  });

  test("pads single digit days", () => {
    expect(parsePublicjobsDate("5 Jan 2026")).toBe("2026-01-05T09:00:00.000Z");
  });

  test("falls back to now for malformed input", () => {
    const before = Date.now();
    const parsed = Date.parse(parsePublicjobsDate("not a date"));
    expect(Number.isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
  });

  test("falls back to now for unknown month", () => {
    expect(Number.isNaN(Date.parse(parsePublicjobsDate("08 Foo 2026")))).toBe(false);
  });
});

describe("parseActivelinkDate", () => {
  test("parses a bare board date at 09:00 UTC", () => {
    expect(parseActivelinkDate("2026-09-08")).toBe("2026-09-08T09:00:00.000Z");
  });

  test("parses full ISO datetimes without appending a second time", () => {
    expect(parseActivelinkDate("2026-09-08T00:00:00+01:00")).toBe("2026-09-07T23:00:00.000Z");
  });

  test("falls back to now for garbage", () => {
    const before = Date.now();
    const parsed = Date.parse(parseActivelinkDate("definitely not a date"));
    expect(Number.isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
  });

  test("falls back to now for empty input", () => {
    expect(Number.isNaN(Date.parse(parseActivelinkDate("")))).toBe(false);
  });
});

describe("mapAshbyPostingToListing", () => {
  test("maps a full posting", () => {
    const listing = mapAshbyPostingToListing(
      {
        id: "1a8e6c59-9eb5-4d62-94f9-871fc9a7c0d4",
        title: "Remote Head of UX (m/f/d)",
        department: "Product & Engineering",
        team: "Product & Engineering",
        employmentType: "FullTime",
        location: "Remote Germany",
        secondaryLocations: [{ location: "Remote Portugal" }],
        publishedAt: "2026-08-19T10:23:43.607+00:00",
        jobUrl: "https://jobs.ashbyhq.com/roompricegenie/1a8e6c59",
        compensationTierSummary: null,
      },
      "roompricegenie",
      "RoomPriceGenie",
    );
    expect(listing?.id).toBe("roompricegenie-1a8e6c59");
    expect(listing?.locationRaw).toBe("Remote Germany; Remote Portugal");
    expect(listing?.workMode).toBe("remote");
    expect(listing?.postedDate).toBe("2026-08-19T10:23:43.607Z");
    expect(listing?.salary).toBe("");
  });

  test("falls back to Remote with no locations", () => {
    const listing = mapAshbyPostingToListing(
      { id: "abc", title: "Engineer", jobUrl: "https://example.com/j" },
      "roompricegenie",
      "RoomPriceGenie",
    );
    expect(listing?.locationRaw).toBe("Remote");
  });

  test("rejects postings missing id, title, or url", () => {
    expect(mapAshbyPostingToListing({ title: "T", jobUrl: "https://example.com" }, "roompricegenie", "RPG")).toBeNull();
    expect(mapAshbyPostingToListing({ id: "a", jobUrl: "https://example.com" }, "roompricegenie", "RPG")).toBeNull();
    expect(mapAshbyPostingToListing({ id: "a", title: "T" }, "roompricegenie", "RPG")).toBeNull();
  });

  test("rejects unsafe urls", () => {
    expect(
      mapAshbyPostingToListing({ id: "a", title: "T", jobUrl: "javascript:alert(1)" }, "roompricegenie", "RPG"),
    ).toBeNull();
  });
});

describe("resolvePublicjobsUrl", () => {
  test("resolves relative hrefs against the board URL", () => {
    expect(resolvePublicjobsUrl("/opp/8550", "https://publicjobs.tal.net/board/")).toBe(
      "https://publicjobs.tal.net/opp/8550",
    );
  });

  test("keeps absolute hrefs", () => {
    expect(resolvePublicjobsUrl("https://example.com/role", "https://publicjobs.tal.net/board/")).toBe(
      "https://example.com/role",
    );
  });
});

describe("extractSalaryFromDetail", () => {
  test("extracts labelled salary paragraphs", () => {
    const html = `<div><p><strong>Salary:</strong> €35,000 per annum, commensurate with experience</p></div>`;
    expect(extractSalaryFromDetail(html)).toContain("€35,000");
  });

  test("ignores paragraphs without pay content", () => {
    const html = `<div><p>Salary: we offer a friendly team and flexible hours</p></div>`;
    expect(extractSalaryFromDetail(html)).toBe("");
  });

  test("returns empty string when no salary present", () => {
    expect(extractSalaryFromDetail(`<div><p>Great role, apply now</p></div>`)).toBe("");
  });
});

describe("mapGreenhouseJobToListing", () => {
  test("maps a full Greenhouse job", () => {
    const listing = mapGreenhouseJobToListing(
      {
        id: 7657434003,
        title: "Application Security Engineer",
        absolute_url: "https://job-boards.greenhouse.io/pokemoncareers/jobs/7657434003",
        location: { name: "London, England, United Kingdom" },
        updated_at: "2026-07-15T17:08:28-04:00",
        first_published: "2026-03-10T11:35:39-04:00",
      },
      "pokemon",
      "The Pokémon Company International",
    );
    expect(listing?.id).toBe("pokemon-76574340");
    expect(listing?.title).toBe("Application Security Engineer");
    expect(listing?.locationRaw).toBe("London, England, United Kingdom");
    expect(listing?.organisation).toBe("The Pokémon Company International");
  });

  test("rejects jobs missing id, title, or url", () => {
    expect(mapGreenhouseJobToListing({ id: 0, title: "", absolute_url: "", location: { name: "" }, updated_at: "", first_published: "" }, "pokemon", "P")).toBeNull();
  });
});

describe("parseDrccPage", () => {
  test("extracts DRCC vacancies", () => {
    const html = `<html><body><div id="content">
      <h3>Crisis Support Therapist</h3>
      <ul><li><strong>Location:</strong> Dublin</li></ul>
      <p><strong>Salary:</strong> €58,958 per annum</p>
      <p>19th June 2026 @ COB</p>
    </div></body></html>`;
    const jobs = parseDrccPage(html, "https://www.drcc.ie/about/vacancies/");
    expect(jobs.length).toBeGreaterThanOrEqual(1);
    expect(jobs[0]?.organisation).toBe("Dublin Rape Crisis Centre");
  });

  test("returns empty array when no vacancies found", () => {
    const html = `<html><body><div id="content"><p>No current vacancies.</p></div></body></html>`;
    expect(parseDrccPage(html, "https://www.drcc.ie/about/vacancies/")).toHaveLength(0);
  });
});

describe("parseRisePage", () => {
  test("extracts RISE vacancies from PDF links", () => {
    const html = `<html><body><div class="bde-rich-text-396-105">
      <ul><li><a href="/wp-content/uploads/2026/06/Play-Therapist-Vacancy-2026-06.pdf" target="_blank"><strong>Play Therapist €80 per session (closing date 1st August, 2026)</strong></a></li></ul>
    </div></body></html>`;
    const jobs = parseRisePage(html, "https://risecounselling.ie/vacancies/");
    expect(jobs.length).toBe(1);
    expect(jobs[0]?.title).toBe("Play Therapist");
    expect(jobs[0]?.organisation).toBe("RISE Counselling");
    expect(jobs[0]?.salary).toBe("€80 per session");
    expect(jobs[0]?.locationRaw).toBe("Kilcoole, Co. Wicklow");
  });

  test("returns empty array when no vacancies found", () => {
    const html = `<html><body><div class="bde-rich-text-396-105"><p>No current vacancies.</p></div></body></html>`;
    expect(parseRisePage(html, "https://risecounselling.ie/vacancies/")).toHaveLength(0);
  });
});
