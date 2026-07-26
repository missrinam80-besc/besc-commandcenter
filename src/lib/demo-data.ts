import type { DashboardData } from "@/lib/types";

export const demoDashboard: DashboardData = {
  name: "Linda", role: "Beheerder", roleKey: "admin", taskCount: 12, inboxCount: 6, projectCount: 4, notificationCount: 0, attentionCount: 3,
  tasks: [
    { id: "1", title: "Partnerbriefing Sunday Sessions afronden", project: "Sunday Sessions", due: "Vandaag", priority: "Hoog", status: "Bezig" },
    { id: "2", title: "Draaiboek community livestream nakijken", project: "BESC Live", due: "Morgen", priority: "Normaal", status: "Review" },
    { id: "3", title: "Vrijwilligers uitnodigen voor TwitchCon", project: "TwitchCon 2027", due: "18 jul", priority: "Hoog", status: "Te doen" },
  ],
  inbox: [
    { id: "1", title: "Workshopidee: veilig streamen", source: "Discord", created: "2 uur geleden" },
    { id: "2", title: "Voorstel samenwerking hardware", source: "E-mail", created: "gisteren" },
  ],
  projects: [
    { id: "1", name: "Sunday Sessions", progress: 72, status: "Actief", due: "25 juli", color: "#ef7f3b" },
    { id: "2", name: "TwitchCon 2027", progress: 38, status: "Gepland", due: "12 september", color: "#7357d6" },
    { id: "3", name: "BESC Content Hub", progress: 54, status: "Actief", due: "30 augustus", color: "#2f8f77" },
  ],
  attention: [],
  schedule: [],
  actionItems: [],
  widgets: [],
};
