import { describe, expect, test } from "bun:test";
import { withMockedFetch } from "./helpers";

describe("withMockedFetch", () => {
  test("routes requests to the responder, passes the url, and returns the run result", async () => {
    const requestedUrls: string[] = [];
    const body = await withMockedFetch(
      (url) => {
        requestedUrls.push(url);
        return new Response("hello");
      },
      async () => (await fetch("https://example.com/page")).text(),
    );
    expect(body).toBe("hello");
    expect(requestedUrls).toEqual(["https://example.com/page"]);
  });

  test("restores the original fetch after a successful run", async () => {
    const originalFetch = globalThis.fetch;
    await withMockedFetch(() => new Response(""), async () => "done");
    expect(globalThis.fetch).toBe(originalFetch);
  });

  test("restores the original fetch when the run function throws", async () => {
    const originalFetch = globalThis.fetch;
    await expect(
      withMockedFetch(
        () => new Response(""),
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");
    expect(globalThis.fetch).toBe(originalFetch);
  });
});
