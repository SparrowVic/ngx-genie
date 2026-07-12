import {GenieServiceRegistration, GenieTreeNode} from '../../../../../../models/genie-node.model';
import {MapperMetrics} from './mapper-metrics';
import {
  ATLAS_FIRST_RING_RADIUS,
  ATLAS_MIN_CELL_SIZE,
  ATLAS_RING_GAP,
  ATLAS_SERVICE_NODE_SPACING,
} from './mapper.constants';
import {StaticLayoutResult} from './mapper.models';

/**
 * Builds the "atlas" layout used for very large graphs: injectors are packed on a square spiral grid
 * and each injector's services fan out in concentric rings around it. Pure and side-effect free.
 */
export class AtlasLayout {
  static _createAtlasLayout(
    nodes: GenieTreeNode[],
    servicesByNodeId: Map<number, GenieServiceRegistration[]>,
    centerX: number,
    centerY: number
  ): StaticLayoutResult {
    const injectorPositions = new Map<number, { x: number; y: number }>();
    const servicePositions = new Map<number, { x: number; y: number }>();

    let maxClusterRadius = ATLAS_MIN_CELL_SIZE / 2;
    for (const services of servicesByNodeId.values()) {
      maxClusterRadius = Math.max(maxClusterRadius, MapperMetrics._estimateAtlasClusterRadius(services.length));
    }

    const cellSize = Math.max(ATLAS_MIN_CELL_SIZE, Math.ceil(maxClusterRadius * 2 + 180));

    nodes.forEach((node, index) => {
      const grid = this._squareSpiralCoordinate(index);
      const position = {
        x: centerX + grid.x * cellSize,
        y: centerY + grid.y * cellSize
      };
      injectorPositions.set(node.id, position);

      const services = servicesByNodeId.get(node.id) ?? [];
      services.forEach((service, serviceIndex) => {
        if (servicePositions.has(service.id)) return;
        servicePositions.set(
          service.id,
          this._serviceAtlasPosition(position, serviceIndex, service.id)
        );
      });
    });

    return {injectorPositions, servicePositions};
  }

  static _serviceAtlasPosition(
    parent: { x: number; y: number },
    index: number,
    serviceId: number
  ): { x: number; y: number } {
    let radius = ATLAS_FIRST_RING_RADIUS;
    let remaining = index;
    let ring = 0;

    while (true) {
      const capacity = Math.max(8, Math.floor((Math.PI * 2 * radius) / ATLAS_SERVICE_NODE_SPACING));
      if (remaining < capacity) {
        const hashOffset = (MapperMetrics._stableHash(String(serviceId)) % 360) * (Math.PI / 180);
        const angle = (remaining / capacity) * Math.PI * 2 + ring * 0.31 + hashOffset / capacity;
        return {
          x: parent.x + Math.cos(angle) * radius,
          y: parent.y + Math.sin(angle) * radius
        };
      }

      remaining -= capacity;
      radius += ATLAS_RING_GAP;
      ring++;
    }
  }

  static _squareSpiralCoordinate(index: number): { x: number; y: number } {
    if (index === 0) return {x: 0, y: 0};

    const layer = Math.ceil((Math.sqrt(index + 1) - 1) / 2);
    const side = layer * 2;
    const maxIndex = (layer * 2 + 1) ** 2 - 1;
    const offset = maxIndex - index;

    if (offset < side) return {x: layer - offset, y: -layer};
    if (offset < side * 2) return {x: -layer, y: -layer + (offset - side)};
    if (offset < side * 3) return {x: -layer + (offset - side * 2), y: layer};
    return {x: layer, y: layer - (offset - side * 3)};
  }
}
