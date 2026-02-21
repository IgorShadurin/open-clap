"use client";

import { MainProjectsPageDashboard } from "./content-dashboard";
import { MainProjectsPageModals } from "./content-modals";
import { useMainProjectsPageController } from "./content-controller";

export function MainProjectsPage() {
  const controller = useMainProjectsPageController();

  return (
    <>
      <MainProjectsPageDashboard controller={controller} />
      <MainProjectsPageModals controller={controller} />
    </>
  );
}
