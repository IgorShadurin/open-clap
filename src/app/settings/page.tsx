import type { Metadata } from "next";

import { SettingsPage } from "@/components/settings-page";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Configure OpenClap runtime settings, templates, execution limits, and defaults for project and daemon behavior.",
  keywords: [
    "OpenClap settings",
    "daemon configuration",
    "task template settings",
    "execution limits",
    "project defaults",
    "local automation config",
  ],
};

export default function SettingsRoutePage() {
  return <SettingsPage />;
}
