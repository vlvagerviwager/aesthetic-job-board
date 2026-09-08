import { describe, expect, test } from "bun:test";
import { asSafeHttpUrl, resolveBoardUrl } from "./urls";

const BOARD_URL = "https://publicjobs.tal.net/board/";

describe("asSafeHttpUrl", () => {
  test("keeps https urls", () => {
    expect(asSafeHttpUrl("https://example.com/role", BOARD_URL)).toBe("https://example.com/role");
  });

  test("rejects javascript: urls", () => {
    expect(asSafeHttpUrl("javascript:alert(1)", BOARD_URL)).toBe(BOARD_URL);
  });

  test("rejects data: urls", () => {
    expect(asSafeHttpUrl("data:text/html,hi", BOARD_URL)).toBe(BOARD_URL);
  });

  test("falls back on empty input", () => {
    expect(asSafeHttpUrl("   ", BOARD_URL)).toBe(BOARD_URL);
  });
});

describe("resolveBoardUrl", () => {
  test("resolves relative hrefs", () => {
    expect(resolveBoardUrl("/opp/8550", BOARD_URL)).toBe("https://publicjobs.tal.net/opp/8550");
  });

  test("keeps absolute https hrefs", () => {
    expect(resolveBoardUrl("https://example.com/role", BOARD_URL)).toBe("https://example.com/role");
  });

  test("rejects javascript: hrefs", () => {
    expect(resolveBoardUrl("javascript:alert(1)", BOARD_URL)).toBe(BOARD_URL);
  });

  test("falls back on empty href", () => {
    expect(resolveBoardUrl("", BOARD_URL)).toBe(BOARD_URL);
  });
});
