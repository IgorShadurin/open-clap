import type { Metadata } from "next";

import { SkillSetPage } from "@/components/skill-set-page";

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

export default async function SkillSetRoutePage(props: {
  params: Promise<{ skillSetId: string }>;
}) {
  const { skillSetId } = await props.params;
  return <SkillSetPage instructionSetId={skillSetId} />;
}
