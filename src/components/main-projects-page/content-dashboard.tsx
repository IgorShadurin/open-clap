"use client";

import Link from "next/link";
import { BookText, Info, Settings } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { MainProjectsPageProjectList } from "./content-project-list";
import { ProjectQuickAdd } from "../quick-add/project-quick-add";
import { OpenClapLogo } from "../task-controls/openclap-logo";
import type { MainProjectsPageController } from "./content-controller";

interface MainProjectsPageDashboardProps {
  controller: MainProjectsPageController;
}

export const MainProjectsPageDashboard = ({ controller }: MainProjectsPageDashboardProps) => {
  const {
    codexUsageModelSummaries,
    codexInfoOpenCardModel,
    codexConnectionInfo,
    codexConnectionStateLabel,
    codexConnectionStateTitle,
    codexConnectionDotClass,
    fiveHourResetLabel,
    weeklyResetLabel,
    renderUsageLimits,
    isCodexInfoOpen,
    toggleCodexInfo,
    codexUsageEndpoint,
    codexResolvedAuthFilePath,
    codexUsageCheckedAt,
    showPerModelLimits,
    setErrorMessage,
    hasLoadedOnce,
    loading,
    projects,
    projectIconPickerProjectId,
    setProjectIconPickerProjectId,
    handleProjectIconUpload,
    handleQuickProjectCreate,
    codexFiveHourLimitUsedPercent,
    codexWeeklyLimitUsedPercent,
    projectIconInputRef,
  } = controller;

  const checkedText = codexUsageCheckedAt
    ? new Date(codexUsageCheckedAt).toLocaleString()
    : "n/a";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-zinc-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="space-y-4">
          <Link
            className="inline-flex items-center gap-2 text-xl font-semibold transition-opacity hover:opacity-80"
            href="/"
          >
            <OpenClapLogo />
            OpenClap
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-2">
            {showPerModelLimits ? (
              <div className="flex flex-wrap gap-3">
                {codexUsageModelSummaries.map((summary) => (
                  <div
                    key={summary.model}
                    data-codex-usage-info-card
                    className="relative w-[320px] space-y-3 rounded-md border border-black/10 bg-white/70 p-4"
                  >
                    <div className="absolute right-3 top-3">
                      <button
                        aria-label={`Codex limits details (${summary.displayLabel})`}
                        className="text-zinc-500 transition-colors hover:text-zinc-800"
                        onClick={() => toggleCodexInfo(summary.model)}
                        title={codexConnectionInfo}
                        type="button"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                      {isCodexInfoOpen(summary.model) ? (
                        <div className="absolute right-0 z-30 mt-2 w-[300px] space-y-1 rounded-md border border-black/10 bg-white p-3 text-xs text-zinc-700 shadow-lg">
                          <div>Auth file: {codexResolvedAuthFilePath}</div>
                          <div>Endpoint: {codexUsageEndpoint ?? "n/a"}</div>
                          <div>Checked: {checkedText}</div>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <span
                          aria-label={codexConnectionStateLabel}
                          title={codexConnectionStateTitle}
                          className={`h-2.5 w-2.5 rounded-full ${codexConnectionDotClass}`}
                        />
                        <span>{summary.displayLabel}</span>
                      </div>
                    </div>
                    {renderUsageLimits(
                      "5h limit",
                      summary.fiveHourUsedPercent,
                      fiveHourResetLabel,
                    )}
                    {renderUsageLimits(
                      "Weekly limit",
                      summary.weeklyUsedPercent ?? 0,
                      weeklyResetLabel,
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="relative w-[320px] space-y-3 rounded-md border border-black/10 bg-white/70 p-4"
                data-codex-usage-info-card
              >
                <div className="absolute right-3 top-3">
                  <button
                    aria-label="Codex limits details"
                    className="text-zinc-500 transition-colors hover:text-zinc-800"
                    onClick={() => toggleCodexInfo(codexInfoOpenCardModel)}
                    title={codexConnectionInfo}
                    type="button"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                  {isCodexInfoOpen(codexInfoOpenCardModel) ? (
                    <div className="absolute right-0 z-30 mt-2 w-[300px] space-y-1 rounded-md border border-black/10 bg-white p-3 text-xs text-zinc-700 shadow-lg">
                      <div>Auth file: {codexResolvedAuthFilePath}</div>
                      <div>Endpoint: {codexUsageEndpoint ?? "n/a"}</div>
                      <div>Checked: {checkedText}</div>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <span
                      aria-label={codexConnectionStateLabel}
                      title={codexConnectionStateTitle}
                      className={`h-2.5 w-2.5 rounded-full ${codexConnectionDotClass}`}
                    />
                    <span>Codex connection</span>
                  </div>
                </div>
                {renderUsageLimits("5h limit", codexFiveHourLimitUsedPercent, fiveHourResetLabel)}
                {renderUsageLimits("Weekly limit", codexWeeklyLimitUsedPercent, weeklyResetLabel)}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button asChild type="button" variant="outline">
                <Link href="/skills">
                  <BookText className="h-4 w-4" />
                  <span className="sr-only">Skills</span>
                </Link>
              </Button>
              <Button asChild type="button" variant="outline">
                <Link href="/settings">
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">Settings</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <ProjectQuickAdd
          onError={(message) => setErrorMessage(message)}
          onSubmit={handleQuickProjectCreate}
          placeholder="Create project"
          submitAriaLabel="Create project"
          submitTitle="Create project"
        />

        <input
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            const projectId = projectIconPickerProjectId;
            event.target.value = "";
            setProjectIconPickerProjectId(null);
            if (!file || !projectId) {
              return;
            }
            void handleProjectIconUpload(projectId, file);
          }}
          ref={projectIconInputRef}
          type="file"
        />

        {!hasLoadedOnce && loading ? (
          <div className="grid gap-4" role="status">
            <Card className="animate-pulse">
              <CardContent className="space-y-3 py-6">
                <div className="h-6 w-52 rounded bg-zinc-200" />
                <div className="h-4 w-72 rounded bg-zinc-200" />
                <div className="h-20 rounded bg-zinc-200" />
              </CardContent>
            </Card>
            <Card className="animate-pulse">
              <CardContent className="space-y-3 py-6">
                <div className="h-6 w-44 rounded bg-zinc-200" />
                <div className="h-4 w-64 rounded bg-zinc-200" />
                <div className="h-14 rounded bg-zinc-200" />
              </CardContent>
            </Card>
          </div>
        ) : null}

        {hasLoadedOnce && projects.length < 1 ? (
          <Card>
            <CardContent className="py-10 text-sm text-zinc-600">
              No projects yet. Use the create project input above.
            </CardContent>
          </Card>
        ) : null}

        <MainProjectsPageProjectList controller={controller} />
      </div>
    </div>
  );
};
