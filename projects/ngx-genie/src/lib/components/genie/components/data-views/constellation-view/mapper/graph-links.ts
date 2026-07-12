import {RenderLink} from '../models/constellation.models';
import {WorkerLink} from '../worker/constellation.worker';
import {MapperMetrics} from './mapper-metrics';
import {
  ATLAS_MAX_RENDERED_AGGREGATE_LINKS,
  SIM_COMPONENT_LINK_LIMIT,
  SIM_DEPENDENCY_LINK_LIMIT,
  SIM_PROVIDER_LINK_LIMIT,
} from './mapper.constants';
import {
  AggregatedDependencyLink,
  AggregatedDependencySummary,
  VisibleDependency,
} from './mapper.models';

/**
 * Cross-injector dependency links: aggregates fan-in/fan-out into inter-injector edges (bounded by a
 * min-heap top-K when there are too many), and down-samples the full link set into the reduced set the
 * physics worker simulates. Pure and side-effect free.
 */
export class GraphLinks {
  static _aggregateDependencySummary(
    dependencies: VisibleDependency[],
    providerOwnerNodeIdByServiceId: Map<number, number>
  ): AggregatedDependencySummary {
    const aggregated = new Map<string, AggregatedDependencyLink>();

    for (const dependency of dependencies) {
      const ownerNodeId = providerOwnerNodeIdByServiceId.get(dependency.providerId);
      if (ownerNodeId === undefined || ownerNodeId === dependency.consumerNodeId) continue;

      const sourceId = `inj-${dependency.consumerNodeId}`;
      const targetId = `inj-${ownerNodeId}`;
      const key = `${sourceId}->${targetId}`;
      const existing = aggregated.get(key);
      if (existing) {
        existing.count++;
      } else {
        aggregated.set(key, {
          sourceId,
          targetId,
          count: 1,
          sortKey: MapperMetrics._stableHash(key)
        });
      }
    }

    const total = aggregated.size;
    if (total <= ATLAS_MAX_RENDERED_AGGREGATE_LINKS) {
      return {
        total,
        renderedLinks: Array.from(aggregated.values()).sort((a, b) => this._compareAggregateLinksDesc(a, b))
      };
    }

    const heap: AggregatedDependencyLink[] = [];
    for (const link of aggregated.values()) {
      this._pushAggregateCandidate(heap, link, ATLAS_MAX_RENDERED_AGGREGATE_LINKS);
    }

    heap.sort((a, b) => this._compareAggregateLinksDesc(a, b));
    return {total, renderedLinks: heap};
  }

  private static _pushAggregateCandidate(
    heap: AggregatedDependencyLink[],
    link: AggregatedDependencyLink,
    limit: number
  ): void {
    if (heap.length < limit) {
      heap.push(link);
      this._siftAggregateUp(heap, heap.length - 1);
      return;
    }

    if (this._compareAggregateLinksAsc(link, heap[0]) <= 0) return;

    heap[0] = link;
    this._siftAggregateDown(heap, 0);
  }

  private static _siftAggregateUp(heap: AggregatedDependencyLink[], index: number): void {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this._compareAggregateLinksAsc(heap[index], heap[parentIndex]) >= 0) return;

      const current = heap[index];
      heap[index] = heap[parentIndex];
      heap[parentIndex] = current;
      index = parentIndex;
    }
  }

  private static _siftAggregateDown(heap: AggregatedDependencyLink[], index: number): void {
    const length = heap.length;

    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let smallestIndex = index;

      if (
        leftIndex < length
        && this._compareAggregateLinksAsc(heap[leftIndex], heap[smallestIndex]) < 0
      ) {
        smallestIndex = leftIndex;
      }
      if (
        rightIndex < length
        && this._compareAggregateLinksAsc(heap[rightIndex], heap[smallestIndex]) < 0
      ) {
        smallestIndex = rightIndex;
      }
      if (smallestIndex === index) return;

      const current = heap[index];
      heap[index] = heap[smallestIndex];
      heap[smallestIndex] = current;
      index = smallestIndex;
    }
  }

  private static _compareAggregateLinksAsc(
    a: AggregatedDependencyLink,
    b: AggregatedDependencyLink
  ): number {
    const countDiff = a.count - b.count;
    if (countDiff !== 0) return countDiff;
    return a.sortKey - b.sortKey;
  }

  private static _compareAggregateLinksDesc(
    a: AggregatedDependencyLink,
    b: AggregatedDependencyLink
  ): number {
    const countDiff = b.count - a.count;
    if (countDiff !== 0) return countDiff;
    return a.sortKey - b.sortKey;
  }

  static _selectSimulationLinks(renderLinks: RenderLink[], nodeCount: number): WorkerLink[] {
    const workerLinks: WorkerLink[] = [];
    const providerLimit = nodeCount > 8000 ? SIM_PROVIDER_LINK_LIMIT * 0.65 : SIM_PROVIDER_LINK_LIMIT;
    const dependencyLimit = nodeCount > 8000 ? SIM_DEPENDENCY_LINK_LIMIT * 0.55 : SIM_DEPENDENCY_LINK_LIMIT;
    const dependencyStride = nodeCount > 8000 ? 13 : nodeCount > 3500 ? 7 : 3;

    let providerCount = 0;
    let componentCount = 0;
    let dependencyCount = 0;
    let seenDependencyLinks = 0;

    for (const link of renderLinks) {
      if (link.type === 'component-child') {
        if (componentCount < SIM_COMPONENT_LINK_LIMIT) {
          workerLinks.push(link);
          componentCount++;
        }
        continue;
      }

      if (link.type === 'provider') {
        if (
          providerCount < providerLimit
          || MapperMetrics._stableHash(link.uniqueId) % 17 === 0
        ) {
          workerLinks.push(link);
          providerCount++;
        }
        continue;
      }

      if (link.type === 'aggregate-dependency') continue;

      seenDependencyLinks++;
      if (
        dependencyCount < dependencyLimit
        && (seenDependencyLinks < 700 || MapperMetrics._stableHash(link.uniqueId) % dependencyStride === 0)
      ) {
        workerLinks.push(link);
        dependencyCount++;
      }
    }

    return workerLinks.map(link => ({
      sourceId: link.sourceId,
      targetId: link.targetId,
      type: link.type
    }));
  }
}
