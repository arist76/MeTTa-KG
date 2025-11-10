export class CapabilityDetector {
  private static _workerSupport: boolean | null = null;
  private static _sharedArrayBufferSupport: boolean | null = null;
  private static _performanceAPISupport: boolean | null = null;

  static get workerSupport(): boolean {
    if (this._workerSupport === null) {
      this._workerSupport = typeof Worker !== "undefined";
    }
    return this._workerSupport;
  }

  static get sharedArrayBufferSupport(): boolean {
    if (this._sharedArrayBufferSupport === null) {
      this._sharedArrayBufferSupport = this.checkSharedArrayBufferSupport();
    }
    return this._sharedArrayBufferSupport;
  }

  private static checkSharedArrayBufferSupport(): boolean {
    if (typeof SharedArrayBuffer === "undefined") {
      console.warn(
        "SharedArrayBuffer is not defined - likely disabled due to security policy"
      );
      return false;
    }

    if (typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated) {
      console.warn(
        "SharedArrayBuffer available but cross-origin isolation not enabled"
      );
      console.info(
        "Required headers: Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp"
      );
      return false;
    }

    try {
      const testBuffer = new SharedArrayBuffer(8);
      return testBuffer instanceof SharedArrayBuffer;
    } catch (error) {
      console.warn("SharedArrayBuffer creation failed:", error);
      return false;
    }
  }

  static get performanceAPISupport(): boolean {
    if (this._performanceAPISupport === null) {
      this._performanceAPISupport =
        typeof performance !== "undefined" &&
        typeof performance.mark === "function" &&
        typeof performance.measure === "function";
    }
    return this._performanceAPISupport;
  }

  static get requestIdleCallbackSupport(): boolean {
    return typeof requestIdleCallback !== "undefined";
  }

  static getCapabilities() {
    return {
      worker: this.workerSupport,
      sharedArrayBuffer: this.sharedArrayBufferSupport,
      performanceAPI: this.performanceAPISupport,
      requestIdleCallback: this.requestIdleCallbackSupport,
    };
  }

  static logCapabilities() {
    const caps = this.getCapabilities();
    console.log("Browser capabilities for D3 Graph optimization:", caps);

    if (!caps.worker) {
      console.warn(
        "Web Workers not supported - falling back to main thread processing"
      );
    }

    if (!caps.sharedArrayBuffer) {
      console.warn(
        "SharedArrayBuffer not supported - using regular arrays for node positions"
      );
      console.info(
        "To enable SharedArrayBuffer, ensure your server sends these headers:"
      );
      console.info("  Cross-Origin-Opener-Policy: same-origin");
      console.info("  Cross-Origin-Embedder-Policy: require-corp");
    }

    if (!caps.performanceAPI) {
      console.warn(
        "Performance API not supported - performance monitoring disabled"
      );
    }

    if (!caps.requestIdleCallback) {
      console.warn(
        "requestIdleCallback not supported - using setTimeout for background tasks"
      );
    }

    return caps;
  }
}

export class OptimizationConfig {
  static readonly CONSTANTS = {
    // Node count thresholds
    MAX_NODES_BASIC: 1000,
    MAX_NODES_WORKER: 5000,
    MAX_NODES_FULL: 10000,

    // Processing chunk sizes
    CHUNK_SIZE_BASIC: 50,
    CHUNK_SIZE_WORKER: 100,
    BATCH_SIZE: 10,

    // Animation durations (ms)
    ANIMATION_BASIC: 200,
    ANIMATION_FULL: 350,
    HOVER_DURATION: 150,
    HOVER_OUT_DURATION: 200,

    // Background processing
    IDLE_TIMEOUT: 50,
    BACKGROUND_DELAY: 16,

    // Priority system
    ROOT_PRIORITY: 100,
    PRIORITY_DECREMENT: 10,
    PRIORITY_DEPTH_MULTIPLIER: 5,
    VISIBILITY_BOOST: 20,

    // Memory management
    CACHE_SIZE_BASIC: 500,
    CACHE_SIZE_WORKER: 1000,
    ESTIMATED_GROWTH_FACTOR: 10,
    DEFAULT_ESTIMATED_NODES: 10000,

    // Progressive Renderer & Layout
    VISIBLE_BUFFER: 200,
    NODE_HEIGHT: 24,
    INTERSECTION_THRESHOLD: 0.1,
  };

  private static getMaxNodesThreshold(): number {
    const caps = CapabilityDetector.getCapabilities();
    if (caps.worker && caps.sharedArrayBuffer) {
      return this.CONSTANTS.MAX_NODES_FULL; // Full optimization
    } else if (caps.worker) {
      return this.CONSTANTS.MAX_NODES_WORKER; // Worker optimization without SharedArrayBuffer
    } else {
      return this.CONSTANTS.MAX_NODES_BASIC; // Basic chunked processing
    }
  }

  private static getChunkSize(): number {
    const caps = CapabilityDetector.getCapabilities();
    return caps.worker
      ? this.CONSTANTS.CHUNK_SIZE_WORKER
      : this.CONSTANTS.CHUNK_SIZE_BASIC;
  }

  private static getAnimationDuration(): number {
    const caps = CapabilityDetector.getCapabilities();
    return caps.worker
      ? this.CONSTANTS.ANIMATION_FULL
      : this.CONSTANTS.ANIMATION_BASIC;
  }

  static getConfig() {
    const caps = CapabilityDetector.getCapabilities();

    return {
      // Processing strategy
      useWorkerProcessing: caps.worker,
      useSharedMemory: caps.sharedArrayBuffer && caps.worker,
      useProgressiveRendering: true, // Always beneficial

      // Performance thresholds
      maxNodesForFullOptimization: this.getMaxNodesThreshold(),
      chunkSize: this.getChunkSize(),

      // Animation settings
      animationDuration: this.getAnimationDuration(),
      enableTransitions: caps.performanceAPI, // Disable if we can't measure performance

      // Background processing
      useIdleCallback: caps.requestIdleCallback,
      backgroundProcessingDelay: caps.requestIdleCallback
        ? 0
        : this.CONSTANTS.BACKGROUND_DELAY,

      // Memory management
      enableCaching: true,
      maxCacheSize: caps.worker
        ? this.CONSTANTS.CACHE_SIZE_WORKER
        : this.CONSTANTS.CACHE_SIZE_BASIC,

      // Debug settings
      enablePerformanceMonitoring: caps.performanceAPI,
      logPerformanceMetrics: false, // Set to true for debugging
    };
  }
}

/**
 * Graceful degradation manager
 */
export class GracefulDegradation {
  private static config = OptimizationConfig.getConfig();

  static shouldUseOptimization(nodeCount: number): boolean {
    return nodeCount <= this.config.maxNodesForFullOptimization;
  }

  static getProcessingStrategy(
    nodeCount: number
  ): "worker" | "chunked" | "synchronous" {
    if (!this.config.useWorkerProcessing) {
      return nodeCount > OptimizationConfig.CONSTANTS.MAX_NODES_BASIC / 2
        ? "chunked"
        : "synchronous";
    }

    if (nodeCount > this.config.maxNodesForFullOptimization) {
      return "chunked";
    }

    return "worker";
  }

  static getChunkSize(nodeCount: number): number {
    const baseChunkSize = this.config.chunkSize;

    // Adjust chunk size based on total nodes
    if (nodeCount < 100)
      return Math.min(nodeCount, OptimizationConfig.CONSTANTS.BATCH_SIZE);
    if (nodeCount < OptimizationConfig.CONSTANTS.MAX_NODES_BASIC)
      return Math.min(nodeCount / 10, baseChunkSize);

    return baseChunkSize;
  }

  static getAnimationDuration(nodeCount: number): number {
    // Reduce animation duration for large datasets
    const baseDuration = this.config.animationDuration;

    if (nodeCount > OptimizationConfig.CONSTANTS.MAX_NODES_BASIC)
      return baseDuration / 2;
    if (nodeCount > OptimizationConfig.CONSTANTS.MAX_NODES_BASIC / 2)
      return baseDuration * 0.75;

    return baseDuration;
  }
}

// Initialize and log capabilities on load
CapabilityDetector.logCapabilities();
