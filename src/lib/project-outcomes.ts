import { z } from "zod";

export const projectOutcomeLabels = {
  goal: "Projectdoel",
  deliverables: "Op te leveren resultaten",
  acceptance_criteria: "Oplevercriteria",
  closure_evaluation: "Afsluitevaluatie",
} as const;
export type ProjectOutcomes = Partial<Record<keyof typeof projectOutcomeLabels, string | null>>;
const text = (max: number) => z.string().trim().max(max).optional().transform(value => value === undefined ? undefined : value || null);
export const projectOutcomeShape = {
  goal: text(2000), deliverables: text(5000), acceptance_criteria: text(5000), closure_evaluation: text(5000),
};
export function missingProjectOutcomes(project: ProjectOutcomes) {
  return (Object.keys(projectOutcomeLabels) as (keyof typeof projectOutcomeLabels)[])
    .filter(key => !project[key]?.trim()).map(key => projectOutcomeLabels[key]);
}
