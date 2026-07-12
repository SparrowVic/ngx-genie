import {Injectable, signal} from '@angular/core';
import {GenieDependency, GenieNode, GenieServiceRegistration} from '../models/genie-node.model';
import {GenieScanStatus} from '../services/genie-registry.service';

const IDLE_SCAN_STATUS: GenieScanStatus = {
  phase: 'settled',
  isActive: false,
  message: 'READY',
  startedAt: null,
  finishedAt: null,
  durationMs: 0,
  nodes: 0,
  services: 0,
  dependencies: 0,
  domProcessed: 0,
  domRemaining: 0,
  deferredProcessed: 0,
  deferredTotal: 0,
  enrichmentProcessed: 0,
  enrichmentTotal: 0
};

/**
 * Test double for GenieRegistryService that exposes exactly the surface GenieExplorerStateService
 * consumes (the `nodes`/`services`/`dependencies`/`scanStatus` signals + the per-node lookups),
 * backed by writable signals so a test can drop a whole mock-app snapshot in and toggle scan state.
 */
@Injectable()
export class MockGenieRegistry {
  readonly nodes = signal<GenieNode[]>([]);
  readonly services = signal<GenieServiceRegistration[]>([]);
  readonly dependencies = signal<GenieDependency[]>([]);
  readonly scanStatus = signal<GenieScanStatus>(IDLE_SCAN_STATUS);

  private nodeIndex = new Map<number, GenieNode>();

  setSnapshot(nodes: GenieNode[], services: GenieServiceRegistration[], deps: GenieDependency[] = []): void {
    this.nodeIndex = new Map(nodes.map((n) => [n.id, n]));
    this.nodes.set(nodes);
    this.services.set(services);
    this.dependencies.set(deps);
  }

  setScanActive(active: boolean): void {
    this.scanStatus.set({...this.scanStatus(), isActive: active, phase: active ? 'scanning' : 'settled'});
  }

  getServicesForNode(nodeId: number): GenieServiceRegistration[] {
    return this.services().filter((s) => s.nodeId === nodeId);
  }

  getDependenciesForNode(nodeId: number): GenieDependency[] {
    return this.dependencies().filter((d) => d.consumerNodeId === nodeId);
  }

  getNodeById(nodeId: number): GenieNode | null {
    return this.nodeIndex.get(nodeId) ?? null;
  }

  getDependenciesForService(serviceId: number): GenieDependency[] {
    return this.dependencies().filter((d) => d.providerId === serviceId);
  }
}
