"use client";

import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface TaskDeleteConfirmationDialogProps {
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  open: boolean;
  taskText: string;
  title: string;
  variantClassName?: string;
  warning?: ReactNode;
}

export function TaskDeleteConfirmationDialog({
  confirmDisabled = false,
  onCancel,
  onConfirm,
  open,
  taskText,
  title,
  variantClassName = "bg-red-600 text-white hover:bg-red-700",
  warning,
}: TaskDeleteConfirmationDialogProps) {
  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onCancel();
        }
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Delete task <strong>{taskText}</strong>? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {warning}
        <DialogFooter>
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            className={variantClassName}
            disabled={confirmDisabled}
            onClick={() => void onConfirm()}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
