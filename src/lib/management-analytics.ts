export type ProgressProject = { id: string; title: string; status: string };
export type ProgressTask = { project_id: string | null; status: string };
export type ProgressMilestone = { project_id: string; is_done: boolean };

export function projectProgress(
  projects: ProgressProject[],
  tasks: ProgressTask[],
  milestones: ProgressMilestone[],
) {
  return projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    const projectMilestones = milestones.filter((milestone) => milestone.project_id === project.id);
    const total = projectTasks.length + projectMilestones.length;
    const completed =
      projectTasks.filter((task) => task.status === "done").length +
      projectMilestones.filter((milestone) => milestone.is_done).length;
    const percentage =
      project.status === "done" ? 100 : total ? Math.round((completed / total) * 100) : 0;
    return {
      ...project,
      total,
      completed,
      open: total - completed,
      percentage,
    };
  });
}

export type WorkloadTask = {
  status: string;
  priority: string;
  due_at: string | null;
  task_assignees?: { user_id: string }[];
};

export function workloadByPerson(
  tasks: WorkloadTask[],
  people: { user_id: string; name: string }[],
  now = new Date(),
) {
  const active = tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const rows = people.map((person) => {
    const assigned = active.filter((task) =>
      (task.task_assignees ?? []).some((assignee) => assignee.user_id === person.user_id),
    );
    return {
      id: person.user_id,
      name: person.name,
      open: assigned.length,
      overdue: assigned.filter((task) => task.due_at && new Date(task.due_at) < now).length,
      urgent: assigned.filter((task) => task.priority === "urgent").length,
      waiting: assigned.filter((task) => ["waiting", "review"].includes(task.status)).length,
    };
  });
  const unassigned = active.filter((task) => !(task.task_assignees ?? []).length);
  if (unassigned.length) {
    rows.push({
      id: "unassigned",
      name: "Niet toegewezen",
      open: unassigned.length,
      overdue: unassigned.filter((task) => task.due_at && new Date(task.due_at) < now).length,
      urgent: unassigned.filter((task) => task.priority === "urgent").length,
      waiting: unassigned.filter((task) => ["waiting", "review"].includes(task.status)).length,
    });
  }
  return rows.filter((row) => row.open).sort((a, b) => b.open - a.open);
}

export type SponsorCampaign = {
  id: string;
  partner_id: string | null;
  value: number | string | null;
  impressions: number | string | null;
  clicks: number | string | null;
};

export type SponsorDeliverable = {
  campaign_id: string;
  status: string;
  due_date: string | null;
};

export function sponsorPerformance(
  partners: { id: string; name: string; estimated_value: number | string | null }[],
  campaigns: SponsorCampaign[],
  deliverables: SponsorDeliverable[],
  nowDate: string,
) {
  return partners.map((partner) => {
    const partnerCampaigns = campaigns.filter((campaign) => campaign.partner_id === partner.id);
    const campaignIds = new Set(partnerCampaigns.map((campaign) => campaign.id));
    const partnerDeliverables = deliverables.filter((item) => campaignIds.has(item.campaign_id));
    const completed = partnerDeliverables.filter((item) =>
      ["completed", "approved"].includes(item.status),
    ).length;
    const overdue = partnerDeliverables.filter(
      (item) =>
        item.due_date &&
        item.due_date < nowDate &&
        !["completed", "approved", "cancelled"].includes(item.status),
    ).length;
    return {
      id: partner.id,
      name: partner.name,
      estimatedValue: Number(partner.estimated_value ?? 0),
      realizedValue: partnerCampaigns.reduce((sum, item) => sum + Number(item.value ?? 0), 0),
      campaigns: partnerCampaigns.length,
      deliverables: partnerDeliverables.length,
      completed,
      overdue,
      impressions: partnerCampaigns.reduce((sum, item) => sum + Number(item.impressions ?? 0), 0),
      clicks: partnerCampaigns.reduce((sum, item) => sum + Number(item.clicks ?? 0), 0),
    };
  }).filter((row) => row.campaigns || row.deliverables || row.estimatedValue);
}
