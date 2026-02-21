"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { requestJson } from "../app-dashboard/helpers";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

interface CreateSubprojectModalProps {
  defaultPath: string;
  onCreated: () => Promise<void> | void;
  onError: (message: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId: string;
  projectName: string;
}

export function CreateSubprojectModal({
  defaultPath,
  onCreated,
  onError,
  onOpenChange,
  open,
  projectId,
  projectName,
}: CreateSubprojectModalProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState(defaultPath);
  const [metadata, setMetadata] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName("");
    setMetadata("");
    setPath(defaultPath);
  }, [defaultPath, open]);

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      await requestJson("/api/subprojects", {
        body: JSON.stringify({
          metadata: metadata || undefined,
          name,
          path,
          projectId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      onOpenChange(false);
      await onCreated();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to create subproject");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Subproject
          </DialogTitle>
          <DialogDescription>
            Add a subproject under <strong>{projectName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="subproject-name">Name</Label>
            <Input
              id="subproject-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              value={name}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="subproject-path">Path</Label>
            <Input
              id="subproject-path"
              onChange={(event) => setPath(event.target.value)}
              placeholder="Path"
              value={path}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="subproject-metadata">Metadata</Label>
            <Textarea
              id="subproject-metadata"
              onChange={(event) => setMetadata(event.target.value)}
              placeholder='{"team":"automation"}'
              value={metadata}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button disabled={submitting} onClick={() => void handleCreate()} type="button">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
