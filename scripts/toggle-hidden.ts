const HIDDEN_CONFIG_PATH = "config/hidden.json";
const JOBS_PAYLOAD_PATH = "public/data/jobs.json";
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
  const hiddenFile = Bun.file(HIDDEN_CONFIG_PATH);
  const hiddenExists = await hiddenFile.exists();
  if (hiddenExists === false) {
    return [];
  }
  const parsedList = (await hiddenFile.json()) as string[];
  return Array.isArray(parsedList) ? parsedList : [];
}

async function readKnownIds(): Promise<Set<string> | null> {
  try {
    const payloadFile = Bun.file(JOBS_PAYLOAD_PATH);
    if ((await payloadFile.exists()) === false) {
      return null;
    }
    const payload = (await payloadFile.json()) as { jobs?: Array<{ id?: string }> };
    if (Array.isArray(payload.jobs) === false) {
      return null;
    }
    const knownIds = new Set<string>();
    for (const jobEntry of payload.jobs ?? []) {
      if (typeof jobEntry.id === "string" && jobEntry.id !== "") {
        knownIds.add(jobEntry.id);
      }
    }
    return knownIds;
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
  if (knownIds !== null && knownIds.has(targetId) === false) {
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
