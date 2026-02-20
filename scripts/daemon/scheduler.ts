export class TaskScheduler {
  private readonly activeTaskIds = new Set<string>();
  private maxParallelTasks: number;

  public constructor(maxParallelTasks: number) {
    this.maxParallelTasks = this.normalizeMaxParallelTasks(maxParallelTasks);
  }

  private normalizeMaxParallelTasks(value: number): number {
    if (!Number.isFinite(value)) {
      return 1;
    }

    return Math.max(1, Math.floor(value));
  }

  public setMaxParallelTasks(value: number): void {
    this.maxParallelTasks = this.normalizeMaxParallelTasks(value);
  }

  public getMaxParallelTasks(): number {
    return this.maxParallelTasks;
  }

  public activeCount(): number {
    return this.activeTaskIds.size;
  }

  public availableSlots(): number {
    return Math.max(0, this.maxParallelTasks - this.activeTaskIds.size);
  }

  public hasCapacity(): boolean {
    return this.availableSlots() > 0;
  }

  public isActive(taskId: string): boolean {
    return this.activeTaskIds.has(taskId);
  }

  public startTask(taskId: string): boolean {
    if (!taskId || this.isActive(taskId) || !this.hasCapacity()) {
      return false;
    }

    this.activeTaskIds.add(taskId);
    return true;
  }

  public finishTask(taskId: string): void {
    this.activeTaskIds.delete(taskId);
  }
}
