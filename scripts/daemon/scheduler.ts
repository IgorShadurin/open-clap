export class TaskScheduler {
  private readonly activeTaskIds = new Set<string>();

  public constructor(private readonly maxParallelTasks: number) {}

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
