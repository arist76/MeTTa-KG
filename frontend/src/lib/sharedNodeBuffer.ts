import { CapabilityDetector } from "./capabilities";

/**
 * SharedNodeBuffer - Optimized SharedArrayBuffer implementation for node data
 * Stores node positions and labels for efficient cross-thread communication
 */

// Layout per node in Float32Array:
// [0-3]: x, y, depth, visible (position data)
// [4-5]: nameOffset, nameLength (label reference in string buffer)
// [6-7]: idOffset, idLength (id reference in string buffer)
// [8-9]: exprOffset, exprLength (expr reference in string buffer)
const FLOATS_PER_NODE = 10;

export class SharedNodeBuffer {
  private nodeBuffer: SharedArrayBuffer | ArrayBuffer;
  private nodeView: Float32Array;
  private stringBuffer: SharedArrayBuffer | ArrayBuffer;
  private stringView: Uint8Array;
  private stringWriteOffset = 0;
  private isShared: boolean;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private stringCache = new Map<string, { offset: number; length: number }>();

  constructor(
    maxNodes: number = 50000,
    maxStringBytes: number = 5 * 1024 * 1024 // 5MB for strings
  ) {
    // Check if SharedArrayBuffer is supported
    this.isShared = CapabilityDetector.sharedArrayBufferSupport;

    try {
      if (this.isShared) {
        // Use SharedArrayBuffer for cross-thread access
        this.nodeBuffer = new SharedArrayBuffer(
          maxNodes * FLOATS_PER_NODE * Float32Array.BYTES_PER_ELEMENT
        );
        this.stringBuffer = new SharedArrayBuffer(maxStringBytes);
        console.info("SharedNodeBuffer: Using SharedArrayBuffer");
      } else {
        // Fallback to regular ArrayBuffer
        this.nodeBuffer = new ArrayBuffer(
          maxNodes * FLOATS_PER_NODE * Float32Array.BYTES_PER_ELEMENT
        );
        this.stringBuffer = new ArrayBuffer(maxStringBytes);
        console.info("SharedNodeBuffer: Using ArrayBuffer fallback");
      }

      this.nodeView = new Float32Array(this.nodeBuffer);
      this.stringView = new Uint8Array(this.stringBuffer);
    } catch (error) {
      console.warn("SharedNodeBuffer: Failed to create buffers:", error);
      // Ultra-fallback: create minimal buffers
      this.isShared = false;
      this.nodeBuffer = new ArrayBuffer(
        Math.min(maxNodes, 10000) *
          FLOATS_PER_NODE *
          Float32Array.BYTES_PER_ELEMENT
      );
      this.stringBuffer = new ArrayBuffer(
        Math.min(maxStringBytes, 1024 * 1024)
      ); // 1MB max
      this.nodeView = new Float32Array(this.nodeBuffer);
      this.stringView = new Uint8Array(this.stringBuffer);
    }
  }

  /**
   * Add a string to the buffer with deduplication
   */
  private addString(str: string): { offset: number; length: number } {
    if (!str) {
      return { offset: 0, length: 0 };
    }

    // Check cache for existing string
    const cached = this.stringCache.get(str);
    if (cached) {
      return cached;
    }

    // Encode and add new string
    const bytes = this.encoder.encode(str);
    const offset = this.stringWriteOffset;

    // Check if we have space
    if (offset + bytes.length > this.stringView.length) {
      console.warn(
        "SharedNodeBuffer: String buffer full, cannot add more strings"
      );
      return { offset: 0, length: 0 };
    }

    // Write string bytes to buffer
    this.stringView.set(bytes, offset);
    this.stringWriteOffset += bytes.length;

    const reference = { offset, length: bytes.length };
    this.stringCache.set(str, reference);

    return reference;
  }

  /**
   * Retrieve a string from the buffer
   */
  private getString(offset: number, length: number): string {
    if (length === 0) return "";

    try {
      const bytes = this.stringView.slice(offset, offset + length);
      return this.decoder.decode(bytes);
    } catch (error) {
      console.error("SharedNodeBuffer: Error decoding string:", error);
      return "";
    }
  }

  /**
   * Set complete node data (position + labels)
   */
  setNodeData(
    nodeIndex: number,
    position: { x: number; y: number; depth: number; visible: number },
    labels: { name: string; id: string; expr?: string }
  ): void {
    const baseIndex = nodeIndex * FLOATS_PER_NODE;

    // Store position data
    this.nodeView[baseIndex + 0] = position.x;
    this.nodeView[baseIndex + 1] = position.y;
    this.nodeView[baseIndex + 2] = position.depth;
    this.nodeView[baseIndex + 3] = position.visible;

    // Store label references
    const nameRef = this.addString(labels.name);
    const idRef = this.addString(labels.id);
    const exprRef = labels.expr
      ? this.addString(labels.expr)
      : { offset: 0, length: 0 };

    this.nodeView[baseIndex + 4] = nameRef.offset;
    this.nodeView[baseIndex + 5] = nameRef.length;
    this.nodeView[baseIndex + 6] = idRef.offset;
    this.nodeView[baseIndex + 7] = idRef.length;
    this.nodeView[baseIndex + 8] = exprRef.offset;
    this.nodeView[baseIndex + 9] = exprRef.length;
  }

  /**
   * Get complete node data (position + labels)
   */
  getNodeData(nodeIndex: number): {
    position: { x: number; y: number; depth: number; visible: number };
    labels: { name: string; id: string; expr?: string };
  } {
    const baseIndex = nodeIndex * FLOATS_PER_NODE;

    // Get position data
    const position = {
      x: this.nodeView[baseIndex + 0],
      y: this.nodeView[baseIndex + 1],
      depth: this.nodeView[baseIndex + 2],
      visible: this.nodeView[baseIndex + 3],
    };

    // Get label data
    const nameOffset = this.nodeView[baseIndex + 4];
    const nameLength = this.nodeView[baseIndex + 5];
    const idOffset = this.nodeView[baseIndex + 6];
    const idLength = this.nodeView[baseIndex + 7];
    const exprOffset = this.nodeView[baseIndex + 8];
    const exprLength = this.nodeView[baseIndex + 9];

    const labels = {
      name: this.getString(nameOffset, nameLength),
      id: this.getString(idOffset, idLength),
      expr: exprLength > 0 ? this.getString(exprOffset, exprLength) : undefined,
    };

    return { position, labels };
  }

  /**
   * Update only position data (fast path for layout calculations)
   */
  updatePosition(
    nodeIndex: number,
    position: { x: number; y: number; depth: number; visible: number }
  ): void {
    const baseIndex = nodeIndex * FLOATS_PER_NODE;
    this.nodeView[baseIndex + 0] = position.x;
    this.nodeView[baseIndex + 1] = position.y;
    this.nodeView[baseIndex + 2] = position.depth;
    this.nodeView[baseIndex + 3] = position.visible;
  }

  /**
   * Get only position data (fast path for rendering)
   */
  getPosition(nodeIndex: number): {
    x: number;
    y: number;
    depth: number;
    visible: number;
  } {
    const baseIndex = nodeIndex * FLOATS_PER_NODE;
    return {
      x: this.nodeView[baseIndex + 0],
      y: this.nodeView[baseIndex + 1],
      depth: this.nodeView[baseIndex + 2],
      visible: this.nodeView[baseIndex + 3],
    };
  }

  /**
   * Get only label data
   */
  getLabels(nodeIndex: number): { name: string; id: string; expr?: string } {
    const baseIndex = nodeIndex * FLOATS_PER_NODE;

    const nameOffset = this.nodeView[baseIndex + 4];
    const nameLength = this.nodeView[baseIndex + 5];
    const idOffset = this.nodeView[baseIndex + 6];
    const idLength = this.nodeView[baseIndex + 7];
    const exprOffset = this.nodeView[baseIndex + 8];
    const exprLength = this.nodeView[baseIndex + 9];

    return {
      name: this.getString(nameOffset, nameLength),
      id: this.getString(idOffset, idLength),
      expr: exprLength > 0 ? this.getString(exprOffset, exprLength) : undefined,
    };
  }

  /**
   * Get buffer references for worker transfer
   */
  getBuffers(): {
    nodeBuffer: SharedArrayBuffer | ArrayBuffer;
    stringBuffer: SharedArrayBuffer | ArrayBuffer;
  } {
    return {
      nodeBuffer: this.nodeBuffer,
      stringBuffer: this.stringBuffer,
    };
  }

  /**
   * Get views for direct access
   */
  getViews(): {
    nodeView: Float32Array;
    stringView: Uint8Array;
  } {
    return {
      nodeView: this.nodeView,
      stringView: this.stringView,
    };
  }

  /**
   * Check if using SharedArrayBuffer
   */
  isUsingSharedMemory(): boolean {
    return this.isShared;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.stringWriteOffset = 0;
    this.stringCache.clear();
    this.nodeView.fill(0);
    this.stringView.fill(0);
  }

  /**
   * Get buffer statistics (for debugging)
   */
  getStats(): {
    nodeBufferSize: number;
    stringBufferSize: number;
    stringBufferUsed: number;
    cachedStrings: number;
  } {
    return {
      nodeBufferSize: this.nodeView.byteLength,
      stringBufferSize: this.stringView.byteLength,
      stringBufferUsed: this.stringWriteOffset,
      cachedStrings: this.stringCache.size,
    };
  }
}
