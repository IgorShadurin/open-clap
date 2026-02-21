"use client";

import { MainProjectsPageProjectCard } from "./content-project-card";
import {
  isProjectCollapsedOnMainPage,
  isProjectSubprojectsVisibleOnMainPage,
  isProjectTasksVisibleOnMainPage,
} from "./content-helpers";
import type { MainProjectsPageController } from "./content-controller";

interface MainProjectsPageProjectListProps {
  controller: MainProjectsPageController;
}

export const MainProjectsPageProjectList = ({ controller }: MainProjectsPageProjectListProps) => {
  return (
    <div>
      {controller.projects.map((project) => {
        const projectCollapsed = isProjectCollapsedOnMainPage(project);
        const projectTasksVisible = isProjectTasksVisibleOnMainPage(project);
        const projectSubprojectsVisible = isProjectSubprojectsVisibleOnMainPage(project);

        return (
          <MainProjectsPageProjectCard
            key={project.id}
            controller={controller}
            project={project}
            projectCollapsed={projectCollapsed}
            projectTasksVisible={projectTasksVisible}
            projectSubprojectsVisible={projectSubprojectsVisible}
          />
        );
      })}
    </div>
  );
};
