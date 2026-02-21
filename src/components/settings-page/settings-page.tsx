"use client";

import { Save, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { CodexUsageApiResponse, SettingRecord } from "../../../shared/contracts";
import { requestJson } from "../app-dashboard/helpers";
import { OpenClapHeader } from "../task-controls/openclap-header";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Textarea } from "../ui/textarea";

function shouldUseTextareaForSetting(settingKey: string): boolean {
  return settingKey.includes("template");
}

function isBooleanSetting(settingKey: string): boolean {
  return settingKey === "codex_usage_proxy_enabled";
}

function isUsageConnectivitySetting(settingKey: string): boolean {
  return (
    settingKey === "codex_usage_auth_file" ||
    settingKey === "codex_usage_proxy_enabled" ||
    settingKey === "codex_usage_proxy_url"
  );
}

interface SettingPresentation {
  description?: string;
  group: string;
  label: string;
}

const SETTING_PRESENTATIONS: Record<string, SettingPresentation> = {
  codex_command_template: {
    description: "Command template used by daemon to run Codex.",
    group: "Daemon Execution",
    label: "Codex command template",
  },
  codex_usage_auth_file: {
    description: "Auth JSON file used for Codex usage-limit checks.",
    group: "Codex Limits",
    label: "Auth file path",
  },
  codex_usage_proxy_enabled: {
    description: "Enable proxy for Codex usage-limit requests.",
    group: "Codex Limits",
    label: "Use proxy",
  },
  codex_usage_proxy_url: {
    description: "Proxy URL for Codex usage-limit requests.",
    group: "Codex Limits",
    label: "Proxy URL",
  },
  daemon_max_parallel_tasks: {
    description: "Maximum number of tasks daemon may run in parallel.",
    group: "Daemon Execution",
    label: "Max parallel tasks",
  },
  default_project_base_path: {
    description: "Default base directory used while creating projects.",
    group: "Project Defaults",
    label: "Default project base path",
  },
  project_path_sort_mode: {
    description: "Directory sorting mode in project-path browser.",
    group: "Project Defaults",
    label: "Project path sort mode",
  },
  task_message_template: {
    description: "Prompt template for tasks without history context.",
    group: "Prompt Templates",
    label: "Task template",
  },
  task_message_template_with_history: {
    description: "Prompt template for tasks with previous-history context.",
    group: "Prompt Templates",
    label: "Task template with history",
  },
};

const GROUP_SORT_ORDER = [
  "Codex Limits",
  "Daemon Execution",
  "Prompt Templates",
  "Project Defaults",
] as const;

function fallbackLabelFromKey(key: string): string {
  return key
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function getSettingPresentation(settingKey: string): SettingPresentation {
  const known = SETTING_PRESENTATIONS[settingKey];
  if (known) {
    return known;
  }

  return {
    group: "General",
    label: fallbackLabelFromKey(settingKey),
  };
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingRecord[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usageCheckSummary, setUsageCheckSummary] = useState<string | null>(null);

  const checkUsageAfterSettingsChange = useCallback(async () => {
    const response = await requestJson<CodexUsageApiResponse>("/api/codex/usage", {
      body: JSON.stringify({ forceRefresh: true }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const first = response.results[0];
    if (!first) {
      throw new Error("Usage API returned no results");
    }

    if (!first.ok || !first.usage) {
      throw new Error(first.error?.trim() || "Usage API check failed");
    }

    const summary = `auth: ${first.authFile} | weekly ${first.usage.weeklyUsedPercent ?? 0}% | 5h ${first.usage.fiveHourUsedPercent}%`;
    setUsageCheckSummary(summary);
    toast.success("Codex usage check passed");
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await requestJson<SettingRecord[]>("/api/settings");
      setSettings(rows);
      setSettingsDraft(
        Object.fromEntries(rows.map((row) => [row.key, row.dbValue ?? row.effectiveValue])),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load settings");
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSetting = async (key: string) => {
    try {
      await requestJson("/api/settings", {
        body: JSON.stringify({ key, value: settingsDraft[key] }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      await loadSettings();
      toast.success(`Setting saved: ${key}`);
      if (isUsageConnectivitySetting(key)) {
        await checkUsageAfterSettingsChange();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save setting");
    }
  };

  const settingsByKey = useMemo(
    () => Object.fromEntries(settings.map((item) => [item.key, item])),
    [settings],
  );
  const groupedSettings = useMemo(() => {
    const grouped = new Map<string, SettingRecord[]>();
    for (const setting of settings) {
      const presentation = getSettingPresentation(setting.key);
      const current = grouped.get(presentation.group) ?? [];
      current.push(setting);
      grouped.set(presentation.group, current);
    }

    return [...grouped.entries()].sort((left, right) => {
      const leftIndex = GROUP_SORT_ORDER.indexOf(left[0] as (typeof GROUP_SORT_ORDER)[number]);
      const rightIndex = GROUP_SORT_ORDER.indexOf(right[0] as (typeof GROUP_SORT_ORDER)[number]);
      const normalizedLeft = leftIndex === -1 ? Number.POSITIVE_INFINITY : leftIndex;
      const normalizedRight = rightIndex === -1 ? Number.POSITIVE_INFINITY : rightIndex;

      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight;
      }

      return left[0].localeCompare(right[0]);
    });
  }, [settings]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-zinc-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <OpenClapHeader />

        {!hasLoadedOnce && loading ? (
          <Card className="animate-pulse">
            <CardHeader>
              <div className="h-6 w-56 rounded bg-zinc-200" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-24 rounded bg-zinc-200" />
              <div className="h-24 rounded bg-zinc-200" />
              <div className="h-16 rounded bg-zinc-200" />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <Settings className="h-4 w-4" />
                Settings
              </div>
              <CardTitle className="text-base">Effective configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {groupedSettings.map(([groupName, items]) => (
                <div className="space-y-3 rounded-md border border-black/10 p-3" key={groupName}>
                  <h3 className="text-sm font-semibold text-zinc-800">{groupName}</h3>
                  {items.map((setting) => {
                    const presentation = getSettingPresentation(setting.key);
                    return (
                      <div className="rounded-md border border-black/10 p-3" key={setting.key}>
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-zinc-900">
                              {presentation.label}
                            </div>
                            <code className="text-[11px] text-zinc-500">{setting.key}</code>
                          </div>
                          <span className="rounded-sm border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                            source: {setting.source}
                          </span>
                        </div>

                        {presentation.description ? (
                          <p className="mb-2 text-xs text-zinc-600">{presentation.description}</p>
                        ) : null}

                        {isBooleanSetting(setting.key) ? (
                          <Select
                            onChange={(event) =>
                              setSettingsDraft((state) => ({
                                ...state,
                                [setting.key]: event.target.value,
                              }))
                            }
                            value={settingsDraft[setting.key] ?? "false"}
                          >
                            <option value="false">disabled</option>
                            <option value="true">enabled</option>
                          </Select>
                        ) : shouldUseTextareaForSetting(setting.key) ? (
                          <Textarea
                            className="min-h-[130px]"
                            onChange={(event) =>
                              setSettingsDraft((state) => ({
                                ...state,
                                [setting.key]: event.target.value,
                              }))
                            }
                            value={settingsDraft[setting.key] ?? ""}
                          />
                        ) : (
                          <Input
                            onChange={(event) =>
                              setSettingsDraft((state) => ({
                                ...state,
                                [setting.key]: event.target.value,
                              }))
                            }
                            value={settingsDraft[setting.key] ?? ""}
                          />
                        )}

                        <div className="mt-2 text-[11px] text-zinc-600">
                          default: {setting.defaultValue ?? "-"} | env: {setting.envValue ?? "-"}{" "}
                          | db: {setting.dbValue ?? "-"}
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Button
                            className="gap-1.5"
                            onClick={() => void saveSetting(setting.key)}
                            size="sm"
                            type="button"
                          >
                            <Save className="h-4 w-4" />
                            Save
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              <div className="rounded-md border border-black/10 bg-zinc-50 p-3 text-xs text-zinc-700">
                Effective defaults:
                <div>sort mode: {settingsByKey.project_path_sort_mode?.effectiveValue ?? "-"}</div>
                <div>
                  base path: {settingsByKey.default_project_base_path?.effectiveValue ?? "-"}
                </div>
                <div>
                  usage check: {usageCheckSummary ?? "save auth/proxy settings to validate immediately"}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog onOpenChange={(open) => !open && setErrorMessage(null)} open={Boolean(errorMessage)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Error</DialogTitle>
            <DialogDescription>
              {errorMessage ?? "An unexpected error occurred."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorMessage(null)} type="button" variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
