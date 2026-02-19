ALTER TABLE "Project"
ADD COLUMN "mainPageTasksVisible" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Project"
ADD COLUMN "mainPageSubprojectsVisible" BOOLEAN NOT NULL DEFAULT true;
