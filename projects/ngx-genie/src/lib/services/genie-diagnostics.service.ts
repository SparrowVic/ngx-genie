import {Injectable, inject, isSignal} from '@angular/core';
import {GenieRegistryService} from './genie-registry.service';
import {GenieServiceRegistration} from '../models/genie-node.model';

export type AnomalyType =
  | 'singleton-violation'
  | 'heavy-state'
  | 'unused-instance'
  | 'high-coupling'
  | 'perf-change-detection'
  | 'large-api'
  | 'circular-risk'
  | 'missing-cleanup';

export type AnomalySeverity = 'critical' | 'warning' | 'info';

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  description: string;
  relatedServiceIds: number[];
  isFramework: boolean;
  suggestion?: string;
  category: 'memory' | 'architecture' | 'performance' | 'best-practice';
}

export interface DiagnosticsConfig {
  checkSingleton: boolean;
  checkHeavyState: boolean;
  checkUnused: boolean;
  checkCoupling: boolean;
  checkChangeDetection: boolean;
  checkLargeApi: boolean;
  checkCircular: boolean;
  checkCleanup: boolean;

  thresholdHeavyState: number;
  thresholdCoupling: number;
  thresholdLargeApi: number;
}

export interface DiagnosticsReport {
  score: number;
  anomalies: Anomaly[];
}

export interface DiagnosticsProgress {
  phase: 'grouping' | 'singletons' | 'services' | 'dependencies' | 'nodes' | 'done';
  processed: number;
  total: number;
  anomalies: number;
}

export const DEFAULT_DIAGNOSTICS_CONFIG: DiagnosticsConfig = {
  checkSingleton: true,
  checkHeavyState: true,
  checkUnused: true,
  checkCoupling: true,
  checkChangeDetection: true,
  checkLargeApi: true,
  checkCircular: true,
  checkCleanup: true,

  thresholdHeavyState: 500,
  thresholdCoupling: 12,
  thresholdLargeApi: 30
};

@Injectable({providedIn: 'root'})
export class GenieDiagnosticsService {
  private registry = inject(GenieRegistryService);
  private readonly sizeEstimateCache = new WeakMap<object, number>();
  private readonly publicPropertyCountCache = new WeakMap<object, number>();
  private readonly injectorReferenceCache = new WeakMap<object, boolean>();
  private readonly subscriptionStateCache = new WeakMap<object, boolean>();

  private readonly maxObjectKeysToScan = 200;
  private readonly maxArrayItemsToSample = 10;
  private readonly chunkBudgetMs = 8;
  private readonly chunkMaxItems = 500;

  runDiagnostics(config: DiagnosticsConfig = DEFAULT_DIAGNOSTICS_CONFIG): DiagnosticsReport {

    const services = this.registry.services();
    const nodes = this.registry.nodes();
    const dependencies = this.registry.dependencies();
    const anomalies: Anomaly[] = [];
    const componentServiceByNodeId = new Map<number, GenieServiceRegistration>();


    const serviceGroups = new Map<string, GenieServiceRegistration[]>();
    services.forEach(svc => {
      const name = svc.label;
      if (!serviceGroups.has(name)) serviceGroups.set(name, []);
      serviceGroups.get(name)!.push(svc);

      if (svc.dependencyType === 'Component' && !componentServiceByNodeId.has(svc.nodeId)) {
        componentServiceByNodeId.set(svc.nodeId, svc);
      }
    });

    if (config.checkSingleton) {
      serviceGroups.forEach((group, name) => {
        if (group.length > 1) {
          const first = group[0];
          const isRoot = first.isRoot || first.token?.['ɵprov']?.providedIn === 'root';
          const isFramework = first.isFramework;


          if (first.dependencyType === 'Component' || first.dependencyType === 'Directive') return;

          if (isRoot) {
            anomalies.push({
              id: `sing-${name}`,
              type: 'singleton-violation',
              severity: isFramework ? 'info' : 'critical',
              title: `Split Singleton: ${name}`,
              description: `Detected ${group.length} instances of a ROOT service. This creates split state!`,
              relatedServiceIds: group.map(s => s.id),
              isFramework,
              category: 'architecture',
              suggestion: 'Remove the service from the "providers" array of components. It should only be provided in "root".'
            });
          } else if (!isFramework) {
            anomalies.push({
              id: `dup-${name}`,
              type: 'singleton-violation',
              severity: 'warning',
              title: `Multiple Instances: ${name}`,
              description: `Detected ${group.length} instances. Ensure this is intentional (e.g. per-component state).`,
              relatedServiceIds: group.map(s => s.id),
              isFramework,
              category: 'architecture',
              suggestion: 'If this service is stateful and should be shared, move it to a parent injector or provide in root.'
            });
          }
        }
      });
    }


    services.forEach(svc => {

      if (svc.instance) {


        if (config.checkHeavyState) {
          const sizeScore = this.estimateInstanceSize(svc.instance);
          if (sizeScore > config.thresholdHeavyState) {
            anomalies.push({
              id: `heavy-${svc.id}`,
              type: 'heavy-state',
              severity: sizeScore > (config.thresholdHeavyState * 4) ? 'critical' : 'warning',
              title: `Heavy State: ${svc.label}`,
              description: `Service holds a large state (~${sizeScore} items). Potential memory leak.`,
              relatedServiceIds: [svc.id],
              isFramework: svc.isFramework,
              category: 'memory',
              suggestion: 'Check for large arrays or unclosed subscriptions accumulating data. Consider paginating data.'
            });
          }
        }


        if (config.checkLargeApi) {
          const propCount = this.countPublicProperties(svc.instance);
          if (propCount > config.thresholdLargeApi && !svc.isFramework) {
            anomalies.push({
              id: `god-${svc.id}`,
              type: 'large-api',
              severity: 'info',
              title: `Large API: ${svc.label}`,
              description: `Service has ${propCount} public properties/methods. It might be doing too much.`,
              relatedServiceIds: [svc.id],
              isFramework: false,
              category: 'architecture',
              suggestion: 'Consider breaking this service into smaller, more focused services (Single Responsibility Principle).'
            });
          }
        }
      }


      if (config.checkUnused) {
        if (
          !svc.isRoot &&
          svc.usageCount === 0 &&
          (
            svc.dependencyType === 'Service' ||
            svc.dependencyType === 'Pipe' ||
            svc.dependencyType === 'Token' ||
            svc.dependencyType === 'Signal' ||
            svc.dependencyType === 'Observable'
          )
        ) {
          anomalies.push({
            id: `zombie-${svc.id}`,
            type: 'unused-instance',
            severity: 'info',
            title: svc.isFramework ? `Unused Internal: ${svc.label}` : `Zombie Provider: ${svc.label}`,
            description: svc.isFramework
              ? 'Angular provider created but never injected. May be tree-shakable but currently instantiated.'
              : 'Provider instance created but never injected/used by any other component/service.',
            relatedServiceIds: [svc.id],
            isFramework: svc.isFramework,
            category: 'best-practice',
            suggestion: 'Remove from "providers" array if not needed, or check if it is provided purely for side-effects.'
          });
        }
      }

      if (config.checkCircular && !svc.isFramework && svc.instance) {
        if (!isSignal(svc.instance) && typeof svc.instance === 'object') {
          if (this.hasInjectorReference(svc.instance)) {
            anomalies.push({
              id: `injector-${svc.id}`,
              type: 'circular-risk',
              severity: 'warning',
              title: `Injector Injection: ${svc.label}`,
              description: 'Service injects "Injector" directly. This often hides circular dependencies or lazy-loading antipatterns.',
              relatedServiceIds: [svc.id],
              isFramework: false,
              category: 'architecture',
              suggestion: 'Try to restructure dependencies to avoid circular references instead of using the Service Locator pattern.'
            });
          }
        }
      }
    });

    const dependencyCounts = new Map<number, number>();
    dependencies.forEach(dep => {
      const current = dependencyCounts.get(dep.consumerNodeId) || 0;
      dependencyCounts.set(dep.consumerNodeId, current + 1);
    });

    nodes.forEach(node => {
      const depCount = dependencyCounts.get(node.id) || 0;

      if (config.checkCoupling) {
        if (depCount > config.thresholdCoupling) {
          const svc = componentServiceByNodeId.get(node.id);
          const relatedIds = svc ? [svc.id] : [];
          const isFramework = node.label.startsWith('ng-') || node.label.startsWith('_');

          if (!isFramework) {
            anomalies.push({
              id: `coupling-${node.id}`,
              type: 'high-coupling',
              severity: depCount > (config.thresholdCoupling * 1.5) ? 'critical' : 'warning',
              title: `High Coupling: ${node.label}`,
              description: `Component depends on ${depCount} other services/tokens. Hard to test and maintain.`,
              relatedServiceIds: relatedIds,
              isFramework: false,
              category: 'architecture',
              suggestion: 'Use Facade pattern to aggregate services or split the component into smaller sub-components.'
            });
          }
        }
      }

      if (node.componentInstance && !node.label.startsWith('Anonymous')) {

        if (config.checkChangeDetection) {
          const ctor = node.componentInstance.constructor;
          const def = (ctor as any)['ɵcmp'];
          if (def) {
            if (def.changeDetection === 1) {
              if (depCount > 2) {
                const svc = componentServiceByNodeId.get(node.id);
                anomalies.push({
                  id: `cd-${node.id}`,
                  type: 'perf-change-detection',
                  severity: 'info',
                  title: `Default Change Detection: ${node.label}`,
                  description: 'Component uses Default Change Detection strategy. OnPush is recommended for performance.',
                  relatedServiceIds: svc ? [svc.id] : [],
                  isFramework: false,
                  category: 'performance',
                  suggestion: 'Switch to ChangeDetectionStrategy.OnPush and use Signals or AsyncPipe for data binding.'
                });
              }
            }
          }
        }

        if (config.checkCleanup) {
          const instance = node.componentInstance;
          const hasSubscriptions = this.hasSubscriptionProperty(instance);

          const proto = Object.getPrototypeOf(instance);
          const hasOnDestroy = !!instance.ngOnDestroy || !!proto.ngOnDestroy;

          if (hasSubscriptions && !hasOnDestroy) {
            const svc = componentServiceByNodeId.get(node.id);
            anomalies.push({
              id: `destroy-${node.id}`,
              type: 'missing-cleanup',
              severity: 'warning',
              title: `Missing Cleanup: ${node.label}`,
              description: 'Component has Subscription properties but does not implement ngOnDestroy. High risk of memory leaks.',
              relatedServiceIds: svc ? [svc.id] : [],
              isFramework: false,
              category: 'memory',
              suggestion: 'Implement OnDestroy and unsubscribe from all subscriptions, or use takeUntilDestroyed().'
            });
          }
        }
      }
    });

    return this.finalizeReport(anomalies);
  }

  runDiagnosticsChunked(
    config: DiagnosticsConfig = DEFAULT_DIAGNOSTICS_CONFIG,
    onProgress: (progress: DiagnosticsProgress) => void,
    onComplete: (report: DiagnosticsReport) => void
  ): () => void {
    const services = this.registry.services();
    const nodes = this.registry.nodes();
    const dependencies = this.registry.dependencies();
    const anomalies: Anomaly[] = [];
    const componentServiceByNodeId = new Map<number, GenieServiceRegistration>();
    const serviceGroups = new Map<string, GenieServiceRegistration[]>();
    const dependencyCounts = new Map<number, number>();
    let cancelled = false;

    const serviceGroupEntries = () => Array.from(serviceGroups.entries());
    let cursor = 0;
    let singletonEntries: Array<[string, GenieServiceRegistration[]]> = [];

    const publish = (phase: DiagnosticsProgress['phase'], processed: number, total: number) => {
      onProgress({phase, processed, total, anomalies: anomalies.length});
    };

    const schedule = (callback: () => void) => this.scheduleDiagnosticsChunk(() => {
      if (!cancelled) callback();
    });

    const processGrouping = () => {
      const startedAt = this.now();
      let processed = 0;
      while (
        cursor < services.length
        && processed < this.chunkMaxItems
        && this.now() - startedAt < this.chunkBudgetMs
      ) {
        const svc = services[cursor];
        const name = svc.label;
        if (!serviceGroups.has(name)) serviceGroups.set(name, []);
        serviceGroups.get(name)!.push(svc);

        if (svc.dependencyType === 'Component' && !componentServiceByNodeId.has(svc.nodeId)) {
          componentServiceByNodeId.set(svc.nodeId, svc);
        }

        cursor++;
        processed++;
      }

      publish('grouping', cursor, services.length);

      if (cursor < services.length) {
        schedule(processGrouping);
        return;
      }

      singletonEntries = serviceGroupEntries();
      cursor = 0;
      schedule(processSingletons);
    };

    const processSingletons = () => {
      const startedAt = this.now();
      let processed = 0;

      while (
        cursor < singletonEntries.length
        && processed < this.chunkMaxItems
        && this.now() - startedAt < this.chunkBudgetMs
      ) {
        if (config.checkSingleton) {
          const [name, group] = singletonEntries[cursor];
          if (group.length > 1) {
            const first = group[0];
            const isRoot = first.isRoot || first.token?.['ɵprov']?.providedIn === 'root';
            const isFramework = first.isFramework;

            if (first.dependencyType !== 'Component' && first.dependencyType !== 'Directive') {
              if (isRoot) {
                anomalies.push({
                  id: `sing-${name}`,
                  type: 'singleton-violation',
                  severity: isFramework ? 'info' : 'critical',
                  title: `Split Singleton: ${name}`,
                  description: `Detected ${group.length} instances of a ROOT service. This creates split state!`,
                  relatedServiceIds: group.map(s => s.id),
                  isFramework,
                  category: 'architecture',
                  suggestion: 'Remove the service from the "providers" array of components. It should only be provided in "root".'
                });
              } else if (!isFramework) {
                anomalies.push({
                  id: `dup-${name}`,
                  type: 'singleton-violation',
                  severity: 'warning',
                  title: `Multiple Instances: ${name}`,
                  description: `Detected ${group.length} instances. Ensure this is intentional (e.g. per-component state).`,
                  relatedServiceIds: group.map(s => s.id),
                  isFramework,
                  category: 'architecture',
                  suggestion: 'If this service is stateful and should be shared, move it to a parent injector or provide in root.'
                });
              }
            }
          }
        }

        cursor++;
        processed++;
      }

      publish('singletons', cursor, singletonEntries.length);

      if (cursor < singletonEntries.length) {
        schedule(processSingletons);
        return;
      }

      cursor = 0;
      schedule(processServices);
    };

    const processServices = () => {
      const startedAt = this.now();
      let processed = 0;

      while (
        cursor < services.length
        && processed < this.chunkMaxItems
        && this.now() - startedAt < this.chunkBudgetMs
      ) {
        this.collectServiceAnomalies(services[cursor], config, anomalies);
        cursor++;
        processed++;
      }

      publish('services', cursor, services.length);

      if (cursor < services.length) {
        schedule(processServices);
        return;
      }

      cursor = 0;
      schedule(processDependencies);
    };

    const processDependencies = () => {
      const startedAt = this.now();
      let processed = 0;

      while (
        cursor < dependencies.length
        && processed < this.chunkMaxItems
        && this.now() - startedAt < this.chunkBudgetMs
      ) {
        const dep = dependencies[cursor];
        dependencyCounts.set(dep.consumerNodeId, (dependencyCounts.get(dep.consumerNodeId) || 0) + 1);
        cursor++;
        processed++;
      }

      publish('dependencies', cursor, dependencies.length);

      if (cursor < dependencies.length) {
        schedule(processDependencies);
        return;
      }

      cursor = 0;
      schedule(processNodes);
    };

    const processNodes = () => {
      const startedAt = this.now();
      let processed = 0;

      while (
        cursor < nodes.length
        && processed < this.chunkMaxItems
        && this.now() - startedAt < this.chunkBudgetMs
      ) {
        this.collectNodeAnomalies(
          nodes[cursor],
          config,
          anomalies,
          dependencyCounts,
          componentServiceByNodeId
        );
        cursor++;
        processed++;
      }

      publish('nodes', cursor, nodes.length);

      if (cursor < nodes.length) {
        schedule(processNodes);
        return;
      }

      publish('done', nodes.length, nodes.length);
      onComplete(this.finalizeReport(anomalies));
    };

    publish('grouping', 0, services.length);
    schedule(processGrouping);

    return () => {
      cancelled = true;
    };
  }

  private collectServiceAnomalies(
    svc: GenieServiceRegistration,
    config: DiagnosticsConfig,
    anomalies: Anomaly[]
  ): void {
    if (svc.instance) {
      if (config.checkHeavyState) {
        const sizeScore = this.estimateInstanceSize(svc.instance);
        if (sizeScore > config.thresholdHeavyState) {
          anomalies.push({
            id: `heavy-${svc.id}`,
            type: 'heavy-state',
            severity: sizeScore > (config.thresholdHeavyState * 4) ? 'critical' : 'warning',
            title: `Heavy State: ${svc.label}`,
            description: `Service holds a large state (~${sizeScore} items). Potential memory leak.`,
            relatedServiceIds: [svc.id],
            isFramework: svc.isFramework,
            category: 'memory',
            suggestion: 'Check for large arrays or unclosed subscriptions accumulating data. Consider paginating data.'
          });
        }
      }

      if (config.checkLargeApi) {
        const propCount = this.countPublicProperties(svc.instance);
        if (propCount > config.thresholdLargeApi && !svc.isFramework) {
          anomalies.push({
            id: `god-${svc.id}`,
            type: 'large-api',
            severity: 'info',
            title: `Large API: ${svc.label}`,
            description: `Service has ${propCount} public properties/methods. It might be doing too much.`,
            relatedServiceIds: [svc.id],
            isFramework: false,
            category: 'architecture',
            suggestion: 'Consider breaking this service into smaller, more focused services (Single Responsibility Principle).'
          });
        }
      }
    }

    if (config.checkUnused) {
      if (
        !svc.isRoot &&
        svc.usageCount === 0 &&
        (
          svc.dependencyType === 'Service' ||
          svc.dependencyType === 'Pipe' ||
          svc.dependencyType === 'Token' ||
          svc.dependencyType === 'Signal' ||
          svc.dependencyType === 'Observable'
        )
      ) {
        anomalies.push({
          id: `zombie-${svc.id}`,
          type: 'unused-instance',
          severity: 'info',
          title: svc.isFramework ? `Unused Internal: ${svc.label}` : `Zombie Provider: ${svc.label}`,
          description: svc.isFramework
            ? 'Angular provider created but never injected. May be tree-shakable but currently instantiated.'
            : 'Provider instance created but never injected/used by any other component/service.',
          relatedServiceIds: [svc.id],
          isFramework: svc.isFramework,
          category: 'best-practice',
          suggestion: 'Remove from "providers" array if not needed, or check if it is provided purely for side-effects.'
        });
      }
    }

    if (config.checkCircular && !svc.isFramework && svc.instance) {
      if (!isSignal(svc.instance) && typeof svc.instance === 'object') {
        if (this.hasInjectorReference(svc.instance)) {
          anomalies.push({
            id: `injector-${svc.id}`,
            type: 'circular-risk',
            severity: 'warning',
            title: `Injector Injection: ${svc.label}`,
            description: 'Service injects "Injector" directly. This often hides circular dependencies or lazy-loading antipatterns.',
            relatedServiceIds: [svc.id],
            isFramework: false,
            category: 'architecture',
            suggestion: 'Try to restructure dependencies to avoid circular references instead of using the Service Locator pattern.'
          });
        }
      }
    }
  }

  private collectNodeAnomalies(
    node: any,
    config: DiagnosticsConfig,
    anomalies: Anomaly[],
    dependencyCounts: Map<number, number>,
    componentServiceByNodeId: Map<number, GenieServiceRegistration>
  ): void {
    const depCount = dependencyCounts.get(node.id) || 0;

    if (config.checkCoupling) {
      if (depCount > config.thresholdCoupling) {
        const svc = componentServiceByNodeId.get(node.id);
        const relatedIds = svc ? [svc.id] : [];
        const isFramework = node.label.startsWith('ng-') || node.label.startsWith('_');

        if (!isFramework) {
          anomalies.push({
            id: `coupling-${node.id}`,
            type: 'high-coupling',
            severity: depCount > (config.thresholdCoupling * 1.5) ? 'critical' : 'warning',
            title: `High Coupling: ${node.label}`,
            description: `Component depends on ${depCount} other services/tokens. Hard to test and maintain.`,
            relatedServiceIds: relatedIds,
            isFramework: false,
            category: 'architecture',
            suggestion: 'Use Facade pattern to aggregate services or split the component into smaller sub-components.'
          });
        }
      }
    }

    if (node.componentInstance && !node.label.startsWith('Anonymous')) {
      if (config.checkChangeDetection) {
        const ctor = node.componentInstance.constructor;
        const def = (ctor as any)['ɵcmp'];
        if (def && def.changeDetection === 1 && depCount > 2) {
          const svc = componentServiceByNodeId.get(node.id);
          anomalies.push({
            id: `cd-${node.id}`,
            type: 'perf-change-detection',
            severity: 'info',
            title: `Default Change Detection: ${node.label}`,
            description: 'Component uses Default Change Detection strategy. OnPush is recommended for performance.',
            relatedServiceIds: svc ? [svc.id] : [],
            isFramework: false,
            category: 'performance',
            suggestion: 'Switch to ChangeDetectionStrategy.OnPush and use Signals or AsyncPipe for data binding.'
          });
        }
      }

      if (config.checkCleanup) {
        const instance = node.componentInstance;
        const hasSubscriptions = this.hasSubscriptionProperty(instance);
        const proto = Object.getPrototypeOf(instance);
        const hasOnDestroy = !!instance.ngOnDestroy || !!proto.ngOnDestroy;

        if (hasSubscriptions && !hasOnDestroy) {
          const svc = componentServiceByNodeId.get(node.id);
          anomalies.push({
            id: `destroy-${node.id}`,
            type: 'missing-cleanup',
            severity: 'warning',
            title: `Missing Cleanup: ${node.label}`,
            description: 'Component has Subscription properties but does not implement ngOnDestroy. High risk of memory leaks.',
            relatedServiceIds: svc ? [svc.id] : [],
            isFramework: false,
            category: 'memory',
            suggestion: 'Implement OnDestroy and unsubscribe from all subscriptions, or use takeUntilDestroyed().'
          });
        }
      }
    }
  }

  private finalizeReport(anomalies: Anomaly[]): DiagnosticsReport {
    let integrity = 100;
    anomalies.forEach(a => {
      if (!a.isFramework) {
        integrity -= a.severity === 'critical' ? 15 : a.severity === 'warning' ? 5 : 1;
      }
    });

    return {
      score: Math.max(0, integrity),
      anomalies: anomalies.sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity))
    };
  }

  private scheduleDiagnosticsChunk(callback: () => void): void {
    const win = typeof window !== 'undefined' ? window as any : null;
    if (win && typeof win.requestIdleCallback === 'function') {
      win.requestIdleCallback(callback, {timeout: 100});
      return;
    }
    setTimeout(callback, 0);
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private getSeverityWeight(s: AnomalySeverity): number {
    if (s === 'critical') return 3;
    if (s === 'warning') return 2;
    return 1;
  }

  private countPublicProperties(obj: any): number {
    if (!obj || typeof obj !== 'object') return 0;
    if (isSignal(obj)) return 1;
    const cached = this.publicPropertyCountCache.get(obj);
    if (cached !== undefined) return cached;

    let count = 0;
    let scanned = 0;
    for (const key in obj) {
      scanned++;
      if (scanned > this.maxObjectKeysToScan) break;
      if (!key.startsWith('_') && !key.startsWith('ng') && !key.startsWith('ɵ') && !key.startsWith('$')) {
        count++;
      }
    }
    this.publicPropertyCountCache.set(obj, count);
    return count;
  }

  private estimateInstanceSize(obj: any): number {
    if (!obj || typeof obj !== 'object') return 0;
    const cached = this.sizeEstimateCache.get(obj);
    if (cached !== undefined) return cached;

    const value = this.estimateSize(obj, 0, new WeakSet<object>());
    this.sizeEstimateCache.set(obj, value);
    return value;
  }

  private estimateSize(obj: any, depth = 0, seen: WeakSet<object>): number {
    if (!obj || depth > 3) return 0;

    if (isSignal(obj)) {
      try {
        return this.estimateSize(obj(), depth, seen);
      } catch {
        return 1;
      }
    }

    if (typeof obj !== 'object') return 1;
    if (seen.has(obj)) return 0;
    seen.add(obj);

    let count = 0;

    if (Array.isArray(obj)) {
      count += obj.length;
      if (obj.length > 0 && typeof obj[0] === 'object') {
        const sampleSize = this.estimateSize(obj[0], depth + 1, seen);
        count += sampleSize * Math.min(obj.length, this.maxArrayItemsToSample);
      }
    } else if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      count += keys.length;
      const limit = Math.min(keys.length, this.maxObjectKeysToScan);
      for (let index = 0; index < limit; index++) {
        const k = keys[index];

        if (!k.startsWith('_') && !k.startsWith('ng') && !k.startsWith('ɵ') && !k.startsWith('$')) {
          try {
            count += this.estimateSize(obj[k], depth + 1, seen);
          } catch {
            count += 1;
          }
        }
      }
    }
    return count;
  }

  private hasInjectorReference(instance: object): boolean {
    const cached = this.injectorReferenceCache.get(instance);
    if (cached !== undefined) return cached;

    let result = false;
    let scanned = 0;
    for (const key of Object.keys(instance)) {
      scanned++;
      if (scanned > this.maxObjectKeysToScan) break;
      try {
        const val = (instance as any)[key];
        if (val && val.constructor && val.constructor.name === 'Injector') {
          result = true;
          break;
        }
      } catch {
      }
    }

    this.injectorReferenceCache.set(instance, result);
    return result;
  }

  private hasSubscriptionProperty(instance: object): boolean {
    const cached = this.subscriptionStateCache.get(instance);
    if (cached !== undefined) return cached;

    let result = false;
    let scanned = 0;
    for (const key of Object.keys(instance)) {
      scanned++;
      if (scanned > this.maxObjectKeysToScan) break;
      try {
        const val = (instance as any)[key];
        if (val && typeof val === 'object' && 'closed' in val && 'unsubscribe' in val) {
          result = true;
          break;
        }
      } catch {
      }
    }

    this.subscriptionStateCache.set(instance, result);
    return result;
  }
}
