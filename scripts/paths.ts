export const SOURCES_CONFIG_PATH = "config/sources.json";
export const HIDDEN_CONFIG_PATH = "config/hidden.json";
export const JOBS_PAYLOAD_PATH = "public/data/jobs.json";

export async function readJsonFile<T>(
  filePath: string,
  fallbackValue: T,
  normalise: (parsedValue: unknown) => T,
): Promise<T> {
  const file = Bun.file(filePath);
  if ((await file.exists()) === false) {
    return fallbackValue;
  }
  return normalise(await file.json());
}
