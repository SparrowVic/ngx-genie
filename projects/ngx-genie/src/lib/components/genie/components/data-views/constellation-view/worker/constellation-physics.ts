/**
 * Force-directed simulation for the constellation graph. This class is stringified into the worker
 * blob (see CONSTELLATION_WORKER_SOURCE), so it MUST stay fully self-contained: no imports, no `self`
 * or DOM access, only plain math. It owns the mutable node/link state and advances it one tick at a
 * time, reporting when the layout has settled so the engine can stop ticking.
 */
export class ConstellationPhysics {
  private nodes: any[] = [];
  private links: any[] = [];
  private width = 800;
  private height = 600;
  private repulsion = 400;
  private nodeMap = new Map<string, any>();

  // Settle detection: average per-node movement (a few jittery nodes shouldn't keep the sim alive),
  // plus a hard tick cap so it always eventually settles.
  private readonly SETTLE_MOVE_SQ = 0.25; // avg movement below ~0.5px/tick is imperceptible
  private readonly SETTLE_TICKS = 40;
  private readonly MAX_SIM_TICKS = 300; // ~5s backstop
  private settleCounter = 0;
  private tickCount = 0;
  private settled = false;

  private readonly CENTER_PULL = 0.003;
  private readonly SPATIAL_CELL_SIZE = 220;
  private readonly SPATIAL_GRID_THRESHOLD = 350;
  private readonly MAX_REPULSION_NEIGHBORS = 128;
  private readonly LINK_DIST_PROVIDER = 55;
  private readonly LINK_STR_PROVIDER = 0.2;
  private readonly LINK_DIST_DEP = 180;
  private readonly LINK_STR_DEP = 0.025;
  private readonly LINK_DIST_COMP = 100;
  private readonly LINK_STR_COMP = 0.05;
  private readonly DAMPING = 0.75;
  private readonly MAX_VEL = 9.0;

  /** Replace the graph, preserving positions/velocities of nodes that persist across the update. */
  setData(newNodes: any[], newLinks: any[]): void {
    const currentNodeMap = new Map<string, any>();
    this.nodes.forEach(n => currentNodeMap.set(n.id, n));

    this.nodes = newNodes.map((n: any) => {
      const existing = currentNodeMap.get(n.id);
      if (existing) {
        return Object.assign({}, n, {
          x: existing.x,
          y: existing.y,
          vx: existing.vx,
          vy: existing.vy
        });
      }
      return n;
    });
    this.links = newLinks;
    this.rebuildNodeMap();
    this.wake();
  }

  setRepulsion(repulsion: number): void {
    this.repulsion = repulsion;
    this.wake();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.wake();
  }

  /** Scatter all nodes randomly around the centre and return the new positions. */
  resetEntropy(): { id: string; x: number; y: number }[] {
    this.wake();
    this.nodes.forEach(n => {
      const angle = Math.random() * 2 * Math.PI;
      const radius = 100 + Math.random() * 300;
      n.x = (this.width / 2) + Math.cos(angle) * radius;
      n.y = (this.height / 2) + Math.sin(angle) * radius;
      n.vx = 0;
      n.vy = 0;
    });
    return this.positions();
  }

  /** Advance the simulation one step and return the new positions plus whether it has settled. */
  tick(): { positions: { id: string; x: number; y: number }[]; settled: boolean } {
    this.calculatePhysics();
    return {positions: this.positions(), settled: this.settled};
  }

  private positions(): { id: string; x: number; y: number }[] {
    return this.nodes.map(n => ({id: n.id, x: n.x, y: n.y}));
  }

  private wake(): void {
    this.settled = false;
    this.settleCounter = 0;
    this.tickCount = 0;
  }

  private rebuildNodeMap(): void {
    this.nodeMap = new Map<string, any>();
    for (let i = 0; i < this.nodes.length; i++) {
      this.nodeMap.set(this.nodes[i].id, this.nodes[i]);
    }
  }

  private applyRepulsionPair(a: any, b: any): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distSq = dx * dx + dy * dy || 0.1;
    const dist = Math.sqrt(distSq);

    const force = (this.repulsion * (a.mass + b.mass)) / (distSq + 100);
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    if (!a.fixed) {
      a.vx -= fx / a.mass;
      a.vy -= fy / a.mass;
    }
    if (!b.fixed) {
      b.vx += fx / b.mass;
      b.vy += fy / b.mass;
    }
  }

  private applyFullRepulsion(nodeCount: number): void {
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        this.applyRepulsionPair(this.nodes[i], this.nodes[j]);
      }
    }
  }

  private applySpatialRepulsion(nodeCount: number): void {
    const grid = new Map<string, any[]>();

    for (let i = 0; i < nodeCount; i++) {
      const node = this.nodes[i];
      node._gridIndex = i;
      node._cellX = Math.floor(node.x / this.SPATIAL_CELL_SIZE);
      node._cellY = Math.floor(node.y / this.SPATIAL_CELL_SIZE);
      const key = node._cellX + ':' + node._cellY;
      let cell = grid.get(key);
      if (!cell) {
        cell = [];
        grid.set(key, cell);
      }
      cell.push(node);
    }

    for (let i = 0; i < nodeCount; i++) {
      const a = this.nodes[i];
      let checkedNeighbors = 0;

      for (let gx = a._cellX - 1; gx <= a._cellX + 1; gx++) {
        if (checkedNeighbors >= this.MAX_REPULSION_NEIGHBORS) break;

        for (let gy = a._cellY - 1; gy <= a._cellY + 1; gy++) {
          if (checkedNeighbors >= this.MAX_REPULSION_NEIGHBORS) break;

          const cell = grid.get(gx + ':' + gy);
          if (!cell) continue;

          for (let c = 0; c < cell.length; c++) {
            const b = cell[c];
            if (b._gridIndex <= i) continue;

            this.applyRepulsionPair(a, b);
            checkedNeighbors++;

            if (checkedNeighbors >= this.MAX_REPULSION_NEIGHBORS) break;
          }
        }
      }
    }
  }

  private calculatePhysics(): void {
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const nodeCount = this.nodes.length;

    for (let i = 0; i < nodeCount; i++) {
      const node = this.nodes[i];
      if (node.type === 'injector') {
        node.vx += (centerX - node.x) * this.CENTER_PULL;
        node.vy += (centerY - node.y) * this.CENTER_PULL;
      }
    }

    if (nodeCount <= this.SPATIAL_GRID_THRESHOLD) {
      this.applyFullRepulsion(nodeCount);
    } else {
      this.applySpatialRepulsion(nodeCount);
    }

    for (const link of this.links) {
      const a = this.nodeMap.get(link.sourceId);
      const b = this.nodeMap.get(link.targetId);
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      let targetDist = this.LINK_DIST_DEP;
      let strength = this.LINK_STR_DEP;

      if (link.type === 'provider') {
        targetDist = this.LINK_DIST_PROVIDER;
        strength = this.LINK_STR_PROVIDER;
      } else if (link.type === 'component-child') {
        targetDist = this.LINK_DIST_COMP;
        strength = this.LINK_STR_COMP;
      }

      const force = (dist - targetDist) * strength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (!a.fixed) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!b.fixed) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    let moveSumSq = 0;
    let movable = 0;
    for (let i = 0; i < nodeCount; i++) {
      const node = this.nodes[i];
      if (node.fixed) continue;

      node.vx *= this.DAMPING;
      node.vy *= this.DAMPING;

      const vSq = node.vx * node.vx + node.vy * node.vy;
      if (vSq > this.MAX_VEL * this.MAX_VEL) {
        const scale = this.MAX_VEL / Math.sqrt(vSq);
        node.vx *= scale;
        node.vy *= scale;
      }

      if (Math.abs(node.vx) < 0.05) node.vx = 0;
      if (Math.abs(node.vy) < 0.05) node.vy = 0;

      node.x += node.vx;
      node.y += node.vy;

      moveSumSq += node.vx * node.vx + node.vy * node.vy;
      movable++;
    }

    this.tickCount++;
    const avgMoveSq = movable > 0 ? moveSumSq / movable : 0;
    if (avgMoveSq < this.SETTLE_MOVE_SQ) {
      if (this.settleCounter < this.SETTLE_TICKS) this.settleCounter++;
      if (this.settleCounter >= this.SETTLE_TICKS) this.settled = true;
    } else {
      this.settleCounter = 0;
    }
    if (this.tickCount >= this.MAX_SIM_TICKS) this.settled = true;
  }
}
