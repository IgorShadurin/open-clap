"use client";

import Link from "next/link";
import { Hand, Save, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { SettingRecord } from "../../shared/contracts";
import { requestJson } from "./app-dashboard-helpers";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

function shouldUseTextareaForSetting(settingKey: string): boolean {
  return settingKey.includes("template");
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingRecord[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save setting");
    }
  };

  const settingsByKey = useMemo(
    () => Object.fromEntries(settings.map((item) => [item.key, item])),
    [settings],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-zinc-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div>
          <Link
            className="inline-flex items-center gap-2 text-xl font-semibold transition-opacity hover:opacity-80"
            href="/"
          >
            <Hand className="h-5 w-5" />
            OpenClap
          </Link>
        </div>

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
              {settings.map((setting) => (
                <div className="rounded-md border border-black/10 p-3" key={setting.key}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <code className="text-xs">{setting.key}</code>
                    <span className="rounded-sm border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      source: {setting.source}
                    </span>
                  </div>

                  {shouldUseTextareaForSetting(setting.key) ? (
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
                    default: {setting.defaultValue ?? "-"} | env: {setting.envValue ?? "-"} | db:{" "}
                    {setting.dbValue ?? "-"}
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
              ))}

              <div className="rounded-md border border-black/10 bg-zinc-50 p-3 text-xs text-zinc-700">
                Effective defaults:
                <div>sort mode: {settingsByKey.project_path_sort_mode?.effectiveValue ?? "-"}</div>
                <div>
                  base path: {settingsByKey.default_project_base_path?.effectiveValue ?? "-"}
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
