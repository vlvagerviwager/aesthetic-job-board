import { describe, expect, test } from "bun:test";
import { isUnknownId, parseArgs } from "./toggle-hidden";

describe("parseArgs", () => {
  test("parses space separated id", () => {
    expect(parseArgs(["--id", "publicjobs-1"])).toEqual({
      targetId: "publicjobs-1",
      shouldUnhide: false,
      shouldList: false,
    });
  });

  test("parses equals id and unhide flag", () => {
    expect(parseArgs(["--id=activelink-2", "--unhide"])).toEqual({
      targetId: "activelink-2",
      shouldUnhide: true,
      shouldList: false,
    });
  });

  test("parses list flag", () => {
    expect(parseArgs(["--list"]).shouldList).toBe(true);
  });

  test("defaults to empty target", () => {
    expect(parseArgs([]).targetId).toBe("");
  });
});

describe("isUnknownId", () => {
  test("allows anything when the payload is missing", () => {
    expect(isUnknownId(null, "whatever")).toBe(false);
  });

  test("flags ids absent from the payload", () => {
    expect(isUnknownId(new Set(["a"]), "b")).toBe(true);
    expect(isUnknownId(new Set(["a"]), "a")).toBe(false);
  });
});
