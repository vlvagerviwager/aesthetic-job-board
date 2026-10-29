import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HIDDEN_CONFIG_PATH, JOBS_PAYLOAD_PATH, SOURCES_CONFIG_PATH, readJsonFile } from "./paths";

describe("path constants", () => {
  test("match the locations used by the scripts", () => {
    expect(SOURCES_CONFIG_PATH).toBe("config/sources.json");
    expect(HIDDEN_CONFIG_PATH).toBe("config/hidden.json");
    expect(JOBS_PAYLOAD_PATH).toBe("public/data/jobs.json");
  });
});

describe("readJsonFile", () => {
  async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), "paths-test-"));
    try {
      return await run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("parses a valid JSON file", async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, "data.json");
      await Bun.write(filePath, JSON.stringify({ jobs: [{ id: "a-1" }] }));
      const parsed = await readJsonFile(filePath, null, (value) => value as { jobs: unknown });
      expect(parsed).toEqual({ jobs: [{ id: "a-1" }] });
    });
  });

  test("returns the fallback when the file does not exist", async () => {
    await withTempDir(async (dir) => {
      const parsed = await readJsonFile(join(dir, "missing.json"), "fallback", (value) => value as string);
      expect(parsed).toBe("fallback");
    });
  });

  test("propagates when the file is not valid JSON so callers do not overwrite corrupt config", async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, "broken.json");
      await Bun.write(filePath, "{not json");
      await expect(readJsonFile(filePath, "fallback", (value) => value as string)).rejects.toThrow();
    });
  });

  test("applies the normalise callback to the parsed value", async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, "list.json");
      await Bun.write(filePath, JSON.stringify({ not: "an array" }));
      const parsed = await readJsonFile(filePath, [] as string[], (value) =>
        Array.isArray(value) ? (value as string[]) : [],
      );
      expect(parsed).toEqual([]);
    });
  });

  test("lets the normalise callback shape a wrapper payload", async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, "payload.json");
      await Bun.write(filePath, JSON.stringify({ jobs: [{ id: "a-1" }, { id: 2 }] }));
      const ids = await readJsonFile(filePath, new Set<string>(), (value) => {
        const payload = value as { jobs?: unknown };
        if (Array.isArray(payload.jobs) === false) {
          return new Set<string>();
        }
        return new Set(
          (payload.jobs as Array<{ id?: unknown }>)
            .map((job) => job.id)
            .filter((id): id is string => typeof id === "string" && id !== ""),
        );
      });
      expect([...ids]).toEqual(["a-1"]);
    });
  });
});
