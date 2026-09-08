const HIDDEN_CONFIG_PATH = "config/hidden.json";
const ID_FLAG_LONG = "--id";
const UNHIDE_FLAG = "--unhide";
const EXIT_FAILURE_CODE = 1;

export {};

function parseArgs(rawArgs: string[]): { targetId: string; shouldUnhide: boolean } {
  let targetId = "";
  let shouldUnhide = false;
  for (let argIndex = 0; argIndex < rawArgs.length; argIndex += 1) {
    const currentArg = rawArgs[argIndex] ?? "";
    if (currentArg === UNHIDE_FLAG) {
      shouldUnhide = true;
    }
    if (currentArg === ID_FLAG_LONG) {
      const nextArg = rawArgs[argIndex + 1] ?? "";
      targetId = nextArg.trim();
    }
    if (currentArg.startsWith(`${ID_FLAG_LONG}=`)) {
      targetId = currentArg.slice(ID_FLAG_LONG.length + 1).trim();
    }
  }
  return { targetId, shouldUnhide };
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

async function mainToggle(): Promise<void> {
  const { targetId, shouldUnhide } = parseArgs(Bun.argv.slice(2));
  if (targetId === "") {
    console.log("Usage: bun run jobs:hide -- --id <job-id> [--unhide]");
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

await mainToggle();
