export type TaskView = { id: string; title: string; project: string; due: string; priority: string; status: string };
export type ProjectView = { id: string; name: string; progress: number; status: string; due: string; color: string };
export type InboxView = { id: string; title: string; source: string; created: string };
export type AttentionView = { id: string; title: string; kind: string; detail: string; href: string; severity: "warning" | "urgent" };
export type ScheduleView = { id: string; title: string; kind: string; when: string; href: string };
export type ActionView = { id: string; title: string; meeting: string; href: string };
export type DashboardWidget = { label: string; value: number; description: string; href: string; tone: "orange" | "violet" | "green" | "red" };

export type DashboardData = {
  name: string;
  role: string;
  roleKey: string;
  taskCount: number;
  inboxCount: number;
  projectCount: number;
  notificationCount: number;
  attentionCount: number;
  tasks: TaskView[];
  inbox: InboxView[];
  projects: ProjectView[];
  attention: AttentionView[];
  schedule: ScheduleView[];
  actionItems: ActionView[];
  widgets: DashboardWidget[];
};
