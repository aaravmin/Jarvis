import type { ResearchTarget } from "@/lib/types";

/**
 * The ONLY generalization seam for auto-populate on the client. Adding companies/tasks later =
 * a new entry here + a new card renderer — not a new page, route, or queue. People ships first.
 */
export type TargetConfig = {
  label: string;
  placeholder: string;
  exampleQueries: string[];
};

export const RESEARCH_TARGETS: Record<ResearchTarget, TargetConfig> = {
  people: {
    label: "Find people",
    placeholder: "Describe who to find — e.g. Brown alumni at a YC biotech startup",
    exampleQueries: [
      "Brown alumni working at YC biotech startups",
      "Recruiters hiring new-grad software engineers at climate-tech companies",
      "Founders of seed-stage AI developer-tools startups in New York",
    ],
  },
};
