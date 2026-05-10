export interface WorkerNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  fixed: boolean;
  type: 'injector' | 'service';
}

export interface WorkerLink {
  sourceId: string;
  targetId: string;
  type: 'provider' | 'dependency' | 'component-child' | 'aggregate-dependency';
}

export interface SimulationData {
  nodes: WorkerNode[];
  links: WorkerLink[];
  width: number;
  height: number;
}

export function constellationWorkerBody() {

  let nodes: any[] = [];
  let links: any[] = [];
  let width = 800;
  let height = 600;


  let repulsion = 400;
  let nodeMap = new Map<string, any>();

  const CENTER_PULL = 0.003;
  const SPATIAL_CELL_SIZE = 220;
  const SPATIAL_GRID_THRESHOLD = 350;
  const MAX_REPULSION_NEIGHBORS = 128;


  const LINK_DIST_PROVIDER = 55;
  const LINK_STR_PROVIDER = 0.2;

  const LINK_DIST_DEP = 180;
  const LINK_STR_DEP = 0.025;


  const LINK_DIST_COMP = 100;
  const LINK_STR_COMP = 0.05;

  const DAMPING = 0.75;
  const MAX_VEL = 9.0;

  const rebuildNodeMap = () => {
    nodeMap = new Map<string, any>();
    for (let i = 0; i < nodes.length; i++) {
      nodeMap.set(nodes[i].id, nodes[i]);
    }
  };

  const applyRepulsionPair = (a: any, b: any) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distSq = dx * dx + dy * dy || 0.1;
    const dist = Math.sqrt(distSq);

    const force = (repulsion * (a.mass + b.mass)) / (distSq + 100);
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
  };

  const applyFullRepulsion = (nodeCount: number) => {
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        applyRepulsionPair(nodes[i], nodes[j]);
      }
    }
  };

  const applySpatialRepulsion = (nodeCount: number) => {
    const grid = new Map<string, any[]>();

    for (let i = 0; i < nodeCount; i++) {
      const node = nodes[i];
      node._gridIndex = i;
      node._cellX = Math.floor(node.x / SPATIAL_CELL_SIZE);
      node._cellY = Math.floor(node.y / SPATIAL_CELL_SIZE);
      const key = node._cellX + ':' + node._cellY;
      let cell = grid.get(key);
      if (!cell) {
        cell = [];
        grid.set(key, cell);
      }
      cell.push(node);
    }

    for (let i = 0; i < nodeCount; i++) {
      const a = nodes[i];
      let checkedNeighbors = 0;

      for (let gx = a._cellX - 1; gx <= a._cellX + 1; gx++) {
        if (checkedNeighbors >= MAX_REPULSION_NEIGHBORS) break;

        for (let gy = a._cellY - 1; gy <= a._cellY + 1; gy++) {
          if (checkedNeighbors >= MAX_REPULSION_NEIGHBORS) break;

          const cell = grid.get(gx + ':' + gy);
          if (!cell) continue;

          for (let c = 0; c < cell.length; c++) {
            const b = cell[c];
            if (b._gridIndex <= i) continue;

            applyRepulsionPair(a, b);
            checkedNeighbors++;

            if (checkedNeighbors >= MAX_REPULSION_NEIGHBORS) break;
          }
        }
      }
    }
  };

  const calculatePhysics = () => {
    const centerX = width / 2;
    const centerY = height / 2;
    const nodeCount = nodes.length;


    for (let i = 0; i < nodeCount; i++) {
      const node = nodes[i];
      if (node.type === 'injector') {
        node.vx += (centerX - node.x) * CENTER_PULL;
        node.vy += (centerY - node.y) * CENTER_PULL;
      }
    }


    if (nodeCount <= SPATIAL_GRID_THRESHOLD) {
      applyFullRepulsion(nodeCount);
    } else {
      applySpatialRepulsion(nodeCount);
    }

    for (const link of links) {
      const a = nodeMap.get(link.sourceId);
      const b = nodeMap.get(link.targetId);
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      let targetDist = LINK_DIST_DEP;
      let strength = LINK_STR_DEP;

      if (link.type === 'provider') {
        targetDist = LINK_DIST_PROVIDER;
        strength = LINK_STR_PROVIDER;
      } else if (link.type === 'component-child') {
        targetDist = LINK_DIST_COMP;
        strength = LINK_STR_COMP;
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


    for (let i = 0; i < nodeCount; i++) {
      const node = nodes[i];
      if (node.fixed) continue;

      node.vx *= DAMPING;
      node.vy *= DAMPING;

      const vSq = node.vx * node.vx + node.vy * node.vy;
      if (vSq > MAX_VEL * MAX_VEL) {
        const scale = MAX_VEL / Math.sqrt(vSq);
        node.vx *= scale;
        node.vy *= scale;
      }

      if (Math.abs(node.vx) < 0.05) node.vx = 0;
      if (Math.abs(node.vy) < 0.05) node.vy = 0;

      node.x += node.vx;
      node.y += node.vy;
    }
  };

  self.addEventListener('message', ({data}: any) => {
    switch (data.type) {
      case 'INIT':
      case 'UPDATE_DATA':
        const newNodes = data.payload.nodes;
        const newLinks = data.payload.links;
        const currentNodeMap = new Map();
        nodes.forEach(n => currentNodeMap.set(n.id, n));

        nodes = newNodes.map((n: any) => {
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
        links = newLinks;
        rebuildNodeMap();
        break;

      case 'UPDATE_PHYSICS':
        if (data.payload.repulsion !== undefined) {
          repulsion = data.payload.repulsion;
        }
        break;

      case 'RESIZE':
        width = data.payload.width;
        height = data.payload.height;
        break;

      case 'TICK':
        calculatePhysics();
        self.postMessage({
          type: 'TICK_RESULT',
          positions: nodes.map(n => ({id: n.id, x: n.x, y: n.y}))
        });
        break;

      case 'RESET_ENTROPY':
        nodes.forEach(n => {
          const angle = Math.random() * 2 * Math.PI;
          const radius = 100 + Math.random() * 300;
          n.x = (width / 2) + Math.cos(angle) * radius;
          n.y = (height / 2) + Math.sin(angle) * radius;
          n.vx = 0;
          n.vy = 0;
        });
        break;
    }
  });
}
