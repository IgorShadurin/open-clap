import type { Metadata } from "next";

import { ListsPage } from "@/components/lists-page/page";

export const metadata: Metadata = {
  title: "Lists",
  description:
    "Manage reusable ordered lists for task placeholders such as $list-country-codes in OpenClap.",
  keywords: [
    "OpenClap lists",
    "task placeholders",
    "reusable list values",
    "ordered list editor",
  ],
};

export default function ListsRoutePage() {
  return <ListsPage />;
}
