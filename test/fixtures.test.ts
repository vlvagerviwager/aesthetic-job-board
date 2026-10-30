import { describe, expect, test } from "bun:test";
import { makeJob } from "./fixtures";
import type { JobListing } from "../src/types";

describe("makeJob", () => {
  test("returns a complete job listing", () => {
    const job = makeJob();
    const requiredKeys: Array<keyof JobListing> = [
      "id",
      "source",
      "title",
      "url",
      "organisation",
      "locationRaw",
      "summary",
      "salary",
      "postedDate",
      "closingDate",
      "workMode",
      "hidden",
    ];
    for (const key of requiredKeys) {
      expect(job[key]).not.toBeUndefined();
    }
  });

  test("merges partial overrides onto the defaults", () => {
    const job = makeJob({ title: "Counsellor", source: "drcc", hidden: true });
    expect(job.title).toBe("Counsellor");
    expect(job.source).toBe("drcc");
    expect(job.hidden).toBe(true);
    expect(job.organisation).toBe("Foróige");
  });

  test("hands out independent objects", () => {
    const first = makeJob();
    first.title = "Changed";
    expect(makeJob().title).toBe("Youth Worker");
  });
});
