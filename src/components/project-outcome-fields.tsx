import { MarkdownField } from "@/components/markdown-field";
import { projectOutcomeLabels, type ProjectOutcomes } from "@/lib/project-outcomes";

export function ProjectOutcomeFields({ project = {}, evaluation = true }: { project?: ProjectOutcomes; evaluation?: boolean }) {
  return <>
    <MarkdownField name="goal" label={projectOutcomeLabels.goal} rows={3} defaultValue={project.goal}/>
    <MarkdownField name="deliverables" label={projectOutcomeLabels.deliverables} rows={4} defaultValue={project.deliverables}/>
    <MarkdownField name="acceptance_criteria" label={projectOutcomeLabels.acceptance_criteria} rows={4} defaultValue={project.acceptance_criteria}/>
    {evaluation ? <MarkdownField name="closure_evaluation" label={projectOutcomeLabels.closure_evaluation} rows={5} defaultValue={project.closure_evaluation}/> : null}
    <p>Beschrijf wat klaar moet zijn, hoe je dit beoordeelt en verwijs naar gekoppelde taken, documenten of resultaten. Vul bij afsluiting de uitkomst, bewijsbronnen, leerpunten en vervolgacties in.</p>
  </>;
}
