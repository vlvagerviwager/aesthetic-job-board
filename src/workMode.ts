import { HYBRID_KEYWORDS, REMOTE_KEYWORDS } from "./constants";
import type { WorkMode } from "./types";

function containsKeyword(haystackLower: string, keywords: string[]): boolean {
  for (const keyword of keywords) {
    if (haystackLower.includes(keyword)) {
      return true;
    }
  }
  return false;
}

export function detectWorkMode(locationRaw: string, title: string, summary: string): WorkMode {
  const combinedText = `${locationRaw} ${title} ${summary}`.toLowerCase();
  if (containsKeyword(combinedText, HYBRID_KEYWORDS)) {
    return "hybrid";
  }
  if (containsKeyword(combinedText, REMOTE_KEYWORDS)) {
    return "remote";
  }
  return "onsite";
}

export function workModeLabel(workMode: WorkMode): string {
  if (workMode === "remote") {
    return "Remote";
  }
  if (workMode === "hybrid") {
    return "Hybrid";
  }
  return "On site";
}
