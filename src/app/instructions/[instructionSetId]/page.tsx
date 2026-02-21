import type { Metadata } from "next";

import { InstructionSetPage } from "@/components/instruction-set-page";

export const metadata: Metadata = {
  title: "Instruction Tasks",
  description:
    "Edit an OpenClap instruction set and manage its ordered task list with reusable execution parameters.",
  keywords: [
    "instruction tasks",
    "OpenClap instruction details",
    "task order editor",
    "AI instruction sequence",
  ],
};

export default async function InstructionSetRoutePage(props: {
  params: Promise<{ instructionSetId: string }>;
}) {
  const { instructionSetId } = await props.params;
  return <InstructionSetPage instructionSetId={instructionSetId} />;
}
