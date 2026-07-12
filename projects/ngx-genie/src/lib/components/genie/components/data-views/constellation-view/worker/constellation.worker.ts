import {ConstellationPhysics} from './constellation-physics';

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

/**
 * Source string for the blob-URL worker. The bundler emits the exported {@link ConstellationPhysics}
 * class as an ANONYMOUS class expression, so we bind it to a name here and then boot a small message
 * dispatcher written as a literal string (rather than a stringified cross-module function, whose
 * class reference the bundler would qualify/rename and thus fail to resolve inside the blob). The
 * dispatcher only calls public methods on the physics instance — a single source of truth for the sim.
 */
export const CONSTELLATION_WORKER_SOURCE = `
const ConstellationPhysics = ${ConstellationPhysics.toString()};
const sim = new ConstellationPhysics();
self.addEventListener('message', function (event) {
  const data = event.data;
  switch (data.type) {
    case 'INIT':
    case 'UPDATE_DATA':
      sim.setData(data.payload.nodes, data.payload.links);
      break;
    case 'UPDATE_PHYSICS':
      if (data.payload.repulsion !== undefined) sim.setRepulsion(data.payload.repulsion);
      break;
    case 'RESIZE':
      sim.resize(data.payload.width, data.payload.height);
      break;
    case 'TICK': {
      const result = sim.tick();
      self.postMessage({ type: 'TICK_RESULT', positions: result.positions, settled: result.settled });
      break;
    }
    case 'RESET_ENTROPY': {
      // Push the scrambled positions back immediately so the reset is visible even while paused.
      const positions = sim.resetEntropy();
      self.postMessage({ type: 'TICK_RESULT', positions: positions });
      break;
    }
  }
});
`;
