"use client";

import { Braces, Plus } from "lucide-react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

interface ListsCreateFormProps {
  createSubmitting: boolean;
  listId: string;
  listItemsText: string;
  onCreate: () => void;
  onListIdChange: (value: string) => void;
  onListItemsTextChange: (value: string) => void;
}

function countNonEmptyLines(value: string): number {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}

export function ListsCreateForm({
  createSubmitting,
  listId,
  listItemsText,
  onCreate,
  onListIdChange,
  onListItemsTextChange,
}: ListsCreateFormProps) {
  const trimmedListId = listId.trim();
  const canCreate = !createSubmitting && trimmedListId.length > 0;
  const itemCount = countNonEmptyLines(listItemsText);
  const tokenPreview = trimmedListId ? `$list-${trimmedListId}` : "$list-your-list-id";

  return (
    <Card className="border-zinc-200/90 bg-white/95 shadow-sm">
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-base font-semibold text-zinc-900">Create reusable list</div>
            <div className="text-sm text-zinc-600">
              Use list tokens directly in tasks, then daemon expands values during execution.
            </div>
          </div>
          <Badge
            className="inline-flex items-center gap-1 border-zinc-300 bg-zinc-100 text-zinc-700"
            variant="outline"
          >
            <Braces className="h-3 w-3" />
            {tokenPreview}
          </Badge>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-list-id">List id</Label>
            <Input
              id="new-list-id"
              onChange={(event) => onListIdChange(event.target.value)}
              placeholder="country-codes"
              value={listId}
            />
            <div className="text-xs text-zinc-500">
              Allowed: lowercase letters, numbers, and hyphens
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="new-list-items">List items</Label>
              <div className="text-xs text-zinc-500">{itemCount} items detected</div>
            </div>
            <Textarea
              className="min-h-[120px] font-mono text-[13px]"
              id="new-list-items"
              onChange={(event) => onListItemsTextChange(event.target.value)}
              placeholder={"ar-SA\nca\ncs"}
              value={listItemsText}
            />
            <div className="text-xs text-zinc-500">One item per line. Empty lines are ignored.</div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button disabled={!canCreate} onClick={onCreate} type="button">
            <Plus className="h-4 w-4" />
            Create list
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
