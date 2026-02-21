import type { Metadata } from "next";

import { MainProjectsPage } from "@/components/main-projects-page/content-impl";

export const metadata: Metadata = {
  title: "Project Navigator",
  description:
    "Manage OpenClap projects, subprojects, and task queues in one place with priority control and execution visibility.",
  keywords: [
    "project navigator",
    "task queue management",
    "project priority",
    "subproject management",
    "AI workflow dashboard",
    "OpenClap home",
  ],
};

export default function Home() {
  return <MainProjectsPage />;
}
