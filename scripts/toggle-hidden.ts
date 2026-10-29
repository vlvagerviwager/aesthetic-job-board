import { HIDDEN_CONFIG_PATH, JOBS_PAYLOAD_PATH, readJsonFile } from "./paths";

const ID_FLAG_LONG = "--id";
const UNHIDE_FLAG = "--unhide";
const LIST_FLAG = "--list";
const EXIT_FAILURE_CODE = 1;

export interface ToggleArgs {
  targetId: string;
  shouldUnhide: boolean;
  shouldList: boolean;
}

export function parseArgs(rawArgs: string[]): ToggleArgs {
  let targetId = "";
  let shouldUnhide = false;
  let shouldList = false;
  for (let argIndex = 0; argIndex < rawArgs.length; argIndex += 1) {
    const currentArg = rawArgs[argIndex] ?? "";
    if (currentArg === UNHIDE_FLAG) {
      shouldUnhide = true;
    }
    if (currentArg === LIST_FLAG) {
      shouldList = true;
    }
    if (currentArg === ID_FLAG_LONG) {
      const nextArg = rawArgs[argIndex + 1] ?? "";
      targetId = nextArg.trim();
    }
    if (currentArg.startsWith(`${ID_FLAG_LONG}=`)) {
      targetId = currentArg.slice(ID_FLAG_LONG.length + 1).trim();
    }
  }
  return { targetId, shouldUnhide, shouldList };
}

async function readHiddenList(): Promise<string[]> {
  return readJsonFile<string[]>(HIDDEN_CONFIG_PATH, [], (parsedList) =>
    Array.isArray(parsedList) ? parsedList : [],
  );
}

export function isUnknownId(knownIds: Set<string> | null, targetId: string): boolean {
  return knownIds !== null && knownIds.has(targetId) === false;
}

async function readKnownIds(): Promise<Set<string> | null> {
  try {
    return await readJsonFile<Set<string> | null>(JOBS_PAYLOAD_PATH, null, (parsedPayload) => {
      const payload = parsedPayload as { jobs?: unknown };
      if (Array.isArray(payload.jobs) === false) {
        return null;
      }
      const knownIds = new Set<string>();
      for (const jobEntry of payload.jobs as Array<{ id?: unknown }>) {
        if (typeof jobEntry.id === "string" && jobEntry.id !== "") {
          knownIds.add(jobEntry.id);
        }
      }
      return knownIds;
    });
  } catch {
    return null;
  }
}

async function mainToggle(): Promise<void> {
  const { targetId, shouldUnhide, shouldList } = parseArgs(Bun.argv.slice(2));
  if (shouldList) {
    const hiddenList = await readHiddenList();
    if (hiddenList.length === 0) {
      console.log("No hidden roles.");
    } else {
      for (const hiddenId of hiddenList) {
        console.log(hiddenId);
      }
    }
    return;
  }
  if (targetId === "") {
    console.log("Usage: bun run jobs:hide -- --id <job-id> [--unhide] | --list");
    process.exit(EXIT_FAILURE_CODE);
  }
  const knownIds = await readKnownIds();
  if (isUnknownId(knownIds, targetId)) {
    console.error(`Unknown job id "${targetId}" (not found in ${JOBS_PAYLOAD_PATH}). Nothing changed.`);
    process.exit(EXIT_FAILURE_CODE);
  }
  const hiddenList = await readHiddenList();
  const hiddenSet = new Set(hiddenList);
  if (shouldUnhide) {
    hiddenSet.delete(targetId);
    console.log(`Unhid ${targetId}`);
  } else {
    hiddenSet.add(targetId);
    console.log(`Hid ${targetId}`);
  }
  const sortedHidden = [...hiddenSet].sort();
  await Bun.write(HIDDEN_CONFIG_PATH, JSON.stringify(sortedHidden, null, 2));
  console.log(`Saved ${sortedHidden.length} hidden ids to ${HIDDEN_CONFIG_PATH}. Rebuild to apply.`);
}

if (import.meta.main) {
  await mainToggle();
}
