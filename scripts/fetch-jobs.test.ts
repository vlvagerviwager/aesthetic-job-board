import { describe, expect, test } from "bun:test";
import {
  extractSalaryFromDetail,
  parseActivelinkDate,
  parsePublicjobsDate,
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
