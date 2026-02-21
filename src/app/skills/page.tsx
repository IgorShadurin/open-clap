import type { Metadata } from "next";

import { SkillsPage } from "@/components/skills-page/page";

export const metadata: Metadata = {
  title: "Skills",
  description:
    "Create and manage reusable skill sets in OpenClap, with ordered task sequences and editable execution parameters.",
  keywords: [
    "OpenClap skills",
    "skill sets",
    "reusable task templates",
    "task orchestration",
    "AI skill workflows",
  ],
};

export default function SkillsRoutePage() {
  return <SkillsPage />;
}
