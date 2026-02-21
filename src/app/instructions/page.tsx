import type { Metadata } from "next";

import { InstructionsPage } from "@/components/instructions-page";

export const metadata: Metadata = {
  title: "Instructions",
  description:
    "Create and manage reusable instruction sets in OpenClap, with ordered task sequences and editable execution parameters.",
  keywords: [
    "OpenClap instructions",
    "instruction sets",
    "reusable task templates",
    "task orchestration",
    "AI instruction workflows",
  ],
};

export default function InstructionsRoutePage() {
  return <InstructionsPage />;
}
