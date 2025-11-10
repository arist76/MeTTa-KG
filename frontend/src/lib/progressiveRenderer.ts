import { OptimizationConfig } from "./capabilities";

export interface RenderTask {
  id: string;
  priority: number;
  execute: () => void;
  isVisible: boolean;
}

interface ViewportInfo {
  top: number;
  bottom: number;
  containerHeight: number;
}

export class ProgressiveRenderer {
  private taskQueue: RenderTask[] = [];
  private isProcessing = false;
  private frameId: number | null = null;
  private idleId: number | null = null;
  private viewport: ViewportInfo = { top: 0, bottom: 0, containerHeight: 0 };
  private intersectionObserver: IntersectionObserver | null = null;
  private visibleElements = new Set<Element>();

  private readonly BATCH_SIZE: number;
  private readonly VISIBLE_BUFFER: number;

  constructor(
    private container: HTMLElement,
    config = OptimizationConfig.getConfig()
  ) {
    this.BATCH_SIZE = OptimizationConfig.CONSTANTS.BATCH_SIZE;
    this.VISIBLE_BUFFER = OptimizationConfig.CONSTANTS.VISIBLE_BUFFER;

    this.setupViewportTracking(); // This calls updateViewport() internally
    this.setupIntersectionObserver();
  }

  private setupViewportTracking() {
    // Track scroll and resize to update viewport
    let ticking = false;

    const updateViewportHandler = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this.updateViewport();
          this.prioritizeTasks();
          ticking = false;
        });
        ticking = true;
      }
    };

    this.container.addEventListener("scroll", updateViewportHandler, {
      passive: true,
    });
    window.addEventListener("resize", updateViewportHandler, { passive: true });

    // Initial viewport update
    this.updateViewport();
  }

  private setupIntersectionObserver() {
    if (typeof IntersectionObserver === "undefined") {
      console.info(
        "IntersectionObserver not supported, using manual viewport tracking"
      );
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.visibleElements.add(entry.target);
          } else {
            this.visibleElements.delete(entry.target);
          }
        });

        // Reprioritize tasks based on visibility changes
        this.prioritizeTasks();
      },
      {
        root: this.container,
        rootMargin: `${this.VISIBLE_BUFFER}px`,
        threshold: OptimizationConfig.CONSTANTS.INTERSECTION_THRESHOLD,
      }
    );
  }

  private updateViewport() {
    const rect = this.container.getBoundingClientRect();
    const scrollTop = this.container.scrollTop;

    this.viewport = {
      top: scrollTop - this.VISIBLE_BUFFER,
      bottom: scrollTop + rect.height + this.VISIBLE_BUFFER,
      containerHeight: rect.height,
    };
  }

  private prioritizeTasks() {
    // Sort tasks by visibility and priority
    this.taskQueue.sort((a, b) => {
      // Visible tasks first
      if (a.isVisible !== b.isVisible) {
        return a.isVisible ? -1 : 1;
      }
      // Then by priority
      return b.priority - a.priority;
    });
  }

  addBulkTasks(tasks: RenderTask[]) {
    this.taskQueue.push(...tasks);
    this.prioritizeTasks();

    if (!this.isProcessing) {
      this.startProcessing();
    }
  }

  private startProcessing() {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.processNextBatch();
  }

  private processNextBatch() {
    if (this.taskQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    // Process visible tasks first in main thread
    const visibleTasks: RenderTask[] = [];
    const remainingTasks: RenderTask[] = [];

    // More efficient: single pass to separate visible/invisible tasks
    for (const task of this.taskQueue) {
      if (task.isVisible && visibleTasks.length < this.BATCH_SIZE) {
        visibleTasks.push(task);
      } else {
        remainingTasks.push(task);
      }
    }

    if (visibleTasks.length > 0) {
      // Update queue with remaining tasks
      this.taskQueue = remainingTasks;

      // Execute visible tasks immediately
      visibleTasks.forEach((task) => {
        try {
          task.execute();
        } catch (error) {
          console.error("Render task failed:", error);
        }
      });

      // Schedule next batch
      this.frameId = requestAnimationFrame(() => this.processNextBatch());
    } else {
      // No visible tasks, process invisible ones during idle time
      this.processInvisibleTasks();
    }
  }

  private processInvisibleTasks() {
    const processInIdle = (deadline: IdleDeadline) => {
      while (deadline.timeRemaining() > 0 && this.taskQueue.length > 0) {
        const task = this.taskQueue.shift();
        if (task) {
          try {
            task.execute();
          } catch (error) {
            console.error("Idle render task failed:", error);
          }
        }
      }

      if (this.taskQueue.length > 0) {
        this.idleId = requestIdleCallback(processInIdle);
      } else {
        this.isProcessing = false;
      }
    };

    this.idleId = requestIdleCallback(processInIdle);
  }

  isNodeVisible(nodeY: number, nodeHeight: number): boolean {
    const nodeTop = nodeY;
    const nodeBottom = nodeY + nodeHeight;

    return nodeBottom >= this.viewport.top && nodeTop <= this.viewport.bottom;
  }

  observeElement(element: Element) {
    if (this.intersectionObserver) {
      this.intersectionObserver.observe(element);
    }
  }

  unobserveElement(element: Element) {
    if (this.intersectionObserver) {
      this.intersectionObserver.unobserve(element);
    }
    this.visibleElements.delete(element);
  }

  isElementVisible(element: Element): boolean {
    return this.visibleElements.has(element);
  }

  clear() {
    this.taskQueue = [];
    this.isProcessing = false;

    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    if (this.idleId) {
      cancelIdleCallback(this.idleId);
      this.idleId = null;
    }

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.visibleElements.clear();
    }
  }

  getQueueSize(): number {
    return this.taskQueue.length;
  }

  getViewportInfo(): ViewportInfo {
    return { ...this.viewport };
  }
}

export function createBatchedTasks<T>(
  items: T[],
  batchSize: number,
  createTask: (batch: T[], batchIndex: number) => RenderTask
): RenderTask[] {
  const tasks: RenderTask[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);
    tasks.push(createTask(batch, batchIndex));
  }

  return tasks;
}
