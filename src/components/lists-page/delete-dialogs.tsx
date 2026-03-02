"use client";

import { Trash2 } from "lucide-react";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface ListsDeleteDialogsProps {
  deleteItemTarget: { itemId: string; listId: string; value: string } | null;
  deleteListTarget: { id: string; itemCount: number } | null;
  deletingItem: boolean;
  deletingList: boolean;
  onCancelDeleteItem: () => void;
  onCancelDeleteList: () => void;
  onConfirmDeleteItem: () => void;
  onConfirmDeleteList: () => void;
}

export function ListsDeleteDialogs({
  deleteItemTarget,
  deleteListTarget,
  deletingItem,
  deletingList,
  onCancelDeleteItem,
  onCancelDeleteList,
  onConfirmDeleteItem,
  onConfirmDeleteList,
}: ListsDeleteDialogsProps) {
  return (
    <>
      <Dialog onOpenChange={(isOpen) => !isOpen && onCancelDeleteList()} open={Boolean(deleteListTarget)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete list</DialogTitle>
            <DialogDescription>
              Delete list <strong>{deleteListTarget?.id ?? ""}</strong> with{" "}
              <strong>{deleteListTarget?.itemCount ?? 0}</strong> items? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={deletingList} onClick={onCancelDeleteList} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deletingList}
              onClick={onConfirmDeleteList}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Delete list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(isOpen) => !isOpen && onCancelDeleteItem()} open={Boolean(deleteItemTarget)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete list item</DialogTitle>
            <DialogDescription>
              Delete item <strong>{deleteItemTarget?.value ?? ""}</strong>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={deletingItem} onClick={onCancelDeleteItem} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deletingItem}
              onClick={onConfirmDeleteItem}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Delete item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
