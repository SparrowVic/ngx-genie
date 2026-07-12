import {RenderNode} from '../models/constellation.models';

/** World-space edge length of one spatial-hash cell. Nodes are bucketed by which cell they fall in. */
export const ATLAS_SPATIAL_CELL_SIZE = 720;

/** What the spatial index needs from the engine to (re)bucket nodes. */
export interface SpatialIndexDeps {
  /** The nodes to index, keyed by id. */
  getNodes(): Map<string, RenderNode>;
  /** Only static (atlas/organic) layouts are indexed; force layouts move every frame and scan all nodes. */
  isStaticLayout(): boolean;
}

/**
 * A uniform-grid spatial hash over node positions. Buckets every node into a fixed-size cell so the
 * engine can answer "which nodes are near this point / inside this viewport" without scanning the whole
 * graph — used for cursor hit-testing (3×3 neighbourhood) and viewport culling (cell range). Only static
 * layouts are indexed; force layouts reposition nodes every tick, so they scan the full set instead.
 */
export class ConstellationSpatialIndex {
  private readonly _buckets = new Map<string, RenderNode[]>();

  constructor(private readonly _deps: SpatialIndexDeps) {}

  /** Drop and rebuild every bucket from the current node positions. No-op (cleared) for force layouts. */
  rebuild(): void {
    this._buckets.clear();
    if (!this._deps.isStaticLayout()) return;

    for (const node of this._deps.getNodes().values()) {
      const key = this.keyForPoint(node.x, node.y);
      const bucket = this._buckets.get(key);
      if (bucket) {
        bucket.push(node);
      } else {
        this._buckets.set(key, [node]);
      }
    }
  }

  /** The cell key a world-space point falls into. */
  keyForPoint(x: number, y: number): string {
    return `${Math.floor(x / ATLAS_SPATIAL_CELL_SIZE)}:${Math.floor(y / ATLAS_SPATIAL_CELL_SIZE)}`;
  }

  /** The nodes bucketed in a specific cell, or undefined if the cell is empty. */
  getCell(cellX: number, cellY: number): RenderNode[] | undefined {
    return this._buckets.get(`${cellX}:${cellY}`);
  }

  /**
   * Every node in the 3×3 cell neighbourhood around a world point, plus the set of ids collected (so the
   * caller can de-dupe against an additional candidate source). Used for cursor hit-testing.
   */
  queryNeighbourhood(worldX: number, worldY: number): { candidates: RenderNode[]; seenIds: Set<string> } {
    const cellX = Math.floor(worldX / ATLAS_SPATIAL_CELL_SIZE);
    const cellY = Math.floor(worldY / ATLAS_SPATIAL_CELL_SIZE);
    const candidates: RenderNode[] = [];
    const seenIds = new Set<string>();

    for (let x = cellX - 1; x <= cellX + 1; x++) {
      for (let y = cellY - 1; y <= cellY + 1; y++) {
        const bucket = this._buckets.get(`${x}:${y}`);
        if (!bucket) continue;
        for (const node of bucket) {
          candidates.push(node);
          seenIds.add(node.id);
        }
      }
    }

    return {candidates, seenIds};
  }
}
