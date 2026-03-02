export interface ReusableListItemEntity {
  createdAt: string;
  id: string;
  listId: string;
  priority: number;
  updatedAt: string;
  value: string;
}

export interface ReusableListEntity {
  createdAt: string;
  id: string;
  items: ReusableListItemEntity[];
  updatedAt: string;
}
