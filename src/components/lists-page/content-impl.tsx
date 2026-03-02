"use client";

import {
  ChevronDown,
  GripVertical,
  List,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { ReusableListEntity } from "../../../shared/contracts";
import { requestJson } from "../app-dashboard/helpers";
import {
  createDraggableContainerHandlers,
  moveItemInList,
  preventControlDragStart,
  stopDragPropagation,
} from "../../lib/drag-drop";
import { OpenClapHeader } from "../task-controls/openclap-header";
import { HeaderNavLinks } from "../task-controls/header-nav-links";
import { useRealtimeSync } from "../task-controls/use-realtime-sync";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { ListsCreateForm } from "./create-form";
import { ListsDeleteDialogs } from "./delete-dialogs";

function compactPreview(values: string[]): string {
  if (values.length < 1) {
    return "(empty)";
  }

  const head = values.slice(0, 3).join(", ");
  return values.length > 3 ? `${head}...` : head;
}

export function ListsPage() {
  const [lists, setLists] = useState<ReusableListEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newListId, setNewListId] = useState("");
  const [newListItemsText, setNewListItemsText] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [expandedListId, setExpandedListId] = useState<string | null>(null);
  const [deleteListTarget, setDeleteListTarget] = useState<{
    id: string;
    itemCount: number;
  } | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<{
    itemId: string;
    listId: string;
    value: string;
  } | null>(null);
  const [deletingList, setDeletingList] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [newItemTextByListId, setNewItemTextByListId] = useState<Record<string, string>>({});
  const [itemDraftById, setItemDraftById] = useState<Record<string, string>>({});
  const [draggingItem, setDraggingItem] = useState<{ itemId: string; listId: string } | null>(null);

  const loadLists = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    try {
      const rows = await requestJson<ReusableListEntity[]>("/api/lists", {
        cache: "no-store",
      });
      setLists(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load lists");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  useRealtimeSync(() => {
    void loadLists({ silent: true });
  });

  const handleCreateList = async () => {
    if (createSubmitting) {
      return;
    }

    setCreateSubmitting(true);
    try {
      await requestJson<ReusableListEntity>("/api/lists", {
        body: JSON.stringify({
          id: newListId.trim(),
          itemsText: newListItemsText,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setNewListId("");
      setNewListItemsText("");
      await loadLists({ silent: true });
      toast.success("List created");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create list");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleDeleteList = async (listId: string): Promise<boolean> => {
    try {
      await requestJson(`/api/lists/${listId}`, { method: "DELETE" });
      setExpandedListId((current) => (current === listId ? null : current));
      await loadLists({ silent: true });
      toast.success("List deleted");
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete list");
      return false;
    }
  };

  const handleCreateItem = async (listId: string) => {
    const value = (newItemTextByListId[listId] ?? "").trim();
    if (value.length < 1) {
      return;
    }

    try {
      await requestJson(`/api/lists/${listId}/items`, {
        body: JSON.stringify({ value }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setNewItemTextByListId((current) => ({ ...current, [listId]: "" }));
      await loadLists({ silent: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create list item");
    }
  };

  const handleSaveItem = async (listId: string, itemId: string, fallbackValue: string) => {
    const value = (itemDraftById[itemId] ?? fallbackValue).trim();
    if (!value) {
      return;
    }

    try {
      await requestJson(`/api/lists/${listId}/items/${itemId}`, {
        body: JSON.stringify({ value }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await loadLists({ silent: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update list item");
    }
  };

  const handleDeleteItem = async (listId: string, itemId: string): Promise<boolean> => {
    try {
      await requestJson(`/api/lists/${listId}/items/${itemId}`, {
        method: "DELETE",
      });
      await loadLists({ silent: true });
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete list item");
      return false;
    }
  };

  const handleItemDrop = async (listId: string, targetItemId: string) => {
    if (!draggingItem || draggingItem.listId !== listId || draggingItem.itemId === targetItemId) {
      return;
    }

    const list = lists.find((item) => item.id === listId);
    if (!list) {
      return;
    }

    const currentOrder = list.items.map((item) => item.id);
    const reordered = moveItemInList(currentOrder, draggingItem.itemId, targetItemId);
    if (!reordered) {
      return;
    }

    try {
      await requestJson(`/api/lists/${listId}/items/reorder`, {
        body: JSON.stringify({ orderedIds: reordered }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await loadLists({ silent: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reorder list items");
    } finally {
      setDraggingItem(null);
    }
  };

  const confirmDeleteList = async () => {
    if (!deleteListTarget || deletingList) {
      return;
    }

    setDeletingList(true);
    try {
      const deleted = await handleDeleteList(deleteListTarget.id);
      if (deleted) {
        setDeleteListTarget(null);
      }
    } finally {
      setDeletingList(false);
    }
  };

  const confirmDeleteItem = async () => {
    if (!deleteItemTarget || deletingItem) {
      return;
    }

    setDeletingItem(true);
    try {
      const deleted = await handleDeleteItem(deleteItemTarget.listId, deleteItemTarget.itemId);
      if (deleted) {
        setDeleteItemTarget(null);
      }
    } finally {
      setDeletingItem(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-zinc-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <OpenClapHeader
          rightSlot={<HeaderNavLinks />}
        />

        <div className="inline-flex items-center gap-2 text-xl font-semibold">
          <List className="h-5 w-5" />
          <span>Lists</span>
        </div>

        {errorMessage ? (
          <Card>
            <CardContent className="py-3 text-sm text-red-700">{errorMessage}</CardContent>
          </Card>
        ) : null}

        <ListsCreateForm
          createSubmitting={createSubmitting}
          listId={newListId}
          listItemsText={newListItemsText}
          onCreate={() => void handleCreateList()}
          onListIdChange={setNewListId}
          onListItemsTextChange={setNewListItemsText}
        />

        {loading ? (
          <Card>
            <CardContent className="py-8 text-sm text-zinc-600">Loading lists...</CardContent>
          </Card>
        ) : null}

        {!loading && lists.length < 1 ? (
          <Card>
            <CardContent className="py-8 text-sm text-zinc-600">No lists yet.</CardContent>
          </Card>
        ) : null}

        {!loading
          ? lists.map((list) => {
              const isExpanded = expandedListId === list.id;

              return (
                <Card key={list.id}>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        className="min-w-0 text-left"
                        onClick={() => setExpandedListId((current) => (current === list.id ? null : list.id))}
                        type="button"
                      >
                        <div className="font-semibold">{list.id}</div>
                        <div className="text-xs text-zinc-500">{list.items.length} items</div>
                        <div className="truncate text-sm text-zinc-600">
                          {list.id}: {compactPreview(list.items.map((item) => item.value))}
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <Button
                          className="h-8 w-8 p-0"
                          onClick={() => setExpandedListId((current) => (current === list.id ? null : list.id))}
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </Button>
                        <Button
                          aria-label={`Delete list ${list.id}`}
                          className="h-8 w-8 p-0"
                          onClick={() =>
                            setDeleteListTarget({
                              id: list.id,
                              itemCount: list.items.length,
                            })
                          }
                          size="icon"
                          title={`Delete list ${list.id}`}
                          type="button"
                          variant="outline"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete list {list.id}</span>
                        </Button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="space-y-2">
                        {list.items.map((item) => {
                          const currentValue = itemDraftById[item.id] ?? item.value;
                          const dragHandlers = createDraggableContainerHandlers({
                            enabled: true,
                            onDragEnd: () => setDraggingItem(null),
                            onDragStart: () => setDraggingItem({ itemId: item.id, listId: list.id }),
                            onDrop: () => void handleItemDrop(list.id, item.id),
                          });

                          return (
                            <div
                              className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border border-black/10 bg-white px-2 py-2"
                              draggable
                              key={item.id}
                              onDragEnd={dragHandlers.onContainerDragEnd}
                              onDragOver={dragHandlers.onContainerDragOver}
                              onDragStart={dragHandlers.onContainerDragStart}
                              onDrop={dragHandlers.onContainerDrop}
                            >
                              <GripVertical className="h-4 w-4 text-zinc-400" />
                              <Input
                                onChange={(event) =>
                                  setItemDraftById((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                                value={currentValue}
                              />
                              <Button
                                className="h-8 w-8 p-0"
                                onClick={() => void handleSaveItem(list.id, item.id, item.value)}
                                onDragStart={preventControlDragStart}
                                onMouseDown={stopDragPropagation}
                                onPointerDown={stopDragPropagation}
                                size="icon"
                                type="button"
                                variant="outline"
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                aria-label={`Delete item ${currentValue} from list ${list.id}`}
                                className="h-8 w-8 p-0"
                                onClick={() =>
                                  setDeleteItemTarget({
                                    itemId: item.id,
                                    listId: list.id,
                                    value: currentValue,
                                  })
                                }
                                onDragStart={preventControlDragStart}
                                onMouseDown={stopDragPropagation}
                                onPointerDown={stopDragPropagation}
                                size="icon"
                                title={`Delete item ${currentValue}`}
                                type="button"
                                variant="outline"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete item {currentValue}</span>
                              </Button>
                            </div>
                          );
                        })}

                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pt-2">
                          <Input
                            onChange={(event) =>
                              setNewItemTextByListId((current) => ({
                                ...current,
                                [list.id]: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void handleCreateItem(list.id);
                              }
                            }}
                            placeholder="Add list item"
                            value={newItemTextByListId[list.id] ?? ""}
                          />
                          <Button onClick={() => void handleCreateItem(list.id)} type="button" variant="outline">
                            <Plus className="h-4 w-4" />
                            Add item
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })
          : null}

        <ListsDeleteDialogs
          deleteItemTarget={deleteItemTarget}
          deleteListTarget={deleteListTarget}
          deletingItem={deletingItem}
          deletingList={deletingList}
          onCancelDeleteItem={() => setDeleteItemTarget(null)}
          onCancelDeleteList={() => setDeleteListTarget(null)}
          onConfirmDeleteItem={() => void confirmDeleteItem()}
          onConfirmDeleteList={() => void confirmDeleteList()}
        />
      </div>
    </div>
  );
}
