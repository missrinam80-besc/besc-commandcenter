export type TaskView = { id: string; title: string; project: string; due: string; priority: string; status: string };
export type ProjectView = { id: string; name: string; progress: number; status: string; due: string; color: string };
export type InboxView = { id: string; title: string; source: string; created: string };

export type DashboardData = {
  name: string;
  role: string;
  taskCount: number;
  inboxCount: number;
  projectCount: number;
  notificationCount: number;
  attentionCount: number;
  tasks: TaskView[];
  inbox: InboxView[];
  projects: ProjectView[];
};
