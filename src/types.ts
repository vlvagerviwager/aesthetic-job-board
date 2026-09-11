export type SourceId = "publicjobs" | "activelink" | "roompricegenie";

export type WorkMode = "remote" | "hybrid" | "onsite";

export interface JobListing {
  id: string;
  source: SourceId;
  title: string;
  url: string;
  organisation: string;
  locationRaw: string;
  summary: string;
  salary: string;
  postedDate: string;
  closingDate: string;
  workMode: WorkMode;
  hidden: boolean;
}

export interface JobsPayload {
  generatedAt: string;
  sources: Array<{
    id: SourceId;
    label: string;
    boardUrl: string;
  }>;
  jobs: JobListing[];
}

export type HiddenFilter = "active" | "hidden" | "all";

export type WorkModeFilter = "all" | WorkMode;

export interface BoardFilters {
  keyword: string;
  sources: SourceId[];
  locations: string[];
  workMode: WorkModeFilter;
  hidden: HiddenFilter;
  salaryMin: number | null;
  salaryMax: number | null;
}
