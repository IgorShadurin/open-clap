import type { Metadata } from "next";

import { SkillSetPage } from "@/components/skill-set-page/page";

export const metadata: Metadata = {
  title: "Skill Tasks",
  description:
    "Edit an OpenClap skill set and manage its ordered task list with reusable execution parameters.",
  keywords: [
    "skill tasks",
    "OpenClap skill details",
    "task order editor",
    "AI skill sequence",
  ],
};

export default async function SkillSetRoutePageLegacy(props: {
  params: Promise<{ instructionSetId: string }>;
}) {
  const { instructionSetId } = await props.params;
  return <SkillSetPage instructionSetId={instructionSetId} />;
}
