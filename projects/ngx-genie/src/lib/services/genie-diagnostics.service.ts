import {Injectable, inject} from '@angular/core';
import {GenieRegistryService} from './genie-registry.service';
import {GenieServiceRegistration} from '../models/genie-node.model';
import {ANGULAR_INTERNALS} from '../configs/angular-internals';

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

  runDiagnostics(config: DiagnosticsConfig = DEFAULT_DIAGNOSTICS_CONFIG): { score: number, anomalies: Anomaly[] } {
    const services = this.registry.services();
    const nodes = this.registry.nodes();
    const dependencies = this.registry.dependencies();
    const anomalies: Anomaly[] = [];

    const serviceGroups = new Map<string, GenieServiceRegistration[]>();
    services.forEach(svc => {
      const name = svc.label;
      if (!serviceGroups.has(name)) serviceGroups.set(name, []);
      serviceGroups.get(name)!.push(svc);
    });

    if (config.checkSingleton) {
      serviceGroups.forEach((group, name) => {
        if (group.length > 1) {
          const first = group[0];
          const isRoot = first.isRoot || first.token?.['ɵprov']?.providedIn === 'root';
          const isFramework = first.isFramework;

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
          const sizeScore = this.estimateSize(svc.instance);
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
          const propCount = Object.keys(svc.instance).length;
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
          (svc.dependencyType === 'Service' || svc.dependencyType === 'Pipe' || svc.dependencyType === 'Token')
        ) {
          anomalies.push({
            id: `zombie-${svc.id}`,
            type: 'unused-instance',
            severity: 'info',
            title: svc.isFramework ? `Unused Internal: ${svc.label}` : `Zombie Service: ${svc.label}`,
            description: svc.isFramework
              ? 'Angular provider created but never injected. May be tree-shakable but currently instantiated.'
              : 'Service instance created but never injected/used by any other component.',
            relatedServiceIds: [svc.id],
            isFramework: svc.isFramework,
            category: 'best-practice',
            suggestion: 'Remove from "providers" array if not needed, or check if it is provided purely for side-effects.'
          });
        }
      }
    });

    const dependencyCounts = new Map<number, number>();
    dependencies.forEach(dep => {
      const current = dependencyCounts.get(dep.consumerNodeId) || 0;
      dependencyCounts.set(dep.consumerNodeId, current + 1);
    });

    if (config.checkCircular) {
      services.forEach(svc => {
        if (!svc.isFramework && svc.instance) {
          const keys = Object.keys(svc.instance);
          const hasInjector = keys.some(k => {
            const val = svc.instance[k];
            return val && val.constructor && val.constructor.name === 'Injector';
          });

          if (hasInjector) {
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
      });
    }

    nodes.forEach(node => {
      const depCount = dependencyCounts.get(node.id) || 0;
      if (config.checkCoupling) {
        if (depCount > config.thresholdCoupling) {
          const svc = services.find(s => s.nodeId === node.id && s.dependencyType === 'Component');
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
                const svc = services.find(s => s.nodeId === node.id && s.dependencyType === 'Component');
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
          const hasSubscriptions = Object.values(instance).some((val: any) =>
            val && typeof val === 'object' && 'closed' in val && 'unsubscribe' in val
          );
          const hasOnDestroy = typeof instance.ngOnDestroy === 'function';

          if (hasSubscriptions && !hasOnDestroy) {
            const svc = services.find(s => s.nodeId === node.id && s.dependencyType === 'Component');
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

  private getSeverityWeight(s: AnomalySeverity): number {
    if (s === 'critical') return 3;
    if (s === 'warning') return 2;
    return 1;
  }

  private estimateSize(obj: any, depth = 0): number {
    if (!obj || depth > 3) return 0;
    let count = 0;

    if (Array.isArray(obj)) {
      count += obj.length;
      if (obj.length > 0 && typeof obj[0] === 'object') {
        const sampleSize = this.estimateSize(obj[0], depth + 1);
        count += sampleSize * Math.min(obj.length, 10);
      }
    } else if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      count += keys.length;
      keys.forEach(k => {
        if (!k.startsWith('_') && !k.startsWith('ng') && !k.startsWith('$')) {
          count += this.estimateSize(obj[k], depth + 1);
        }
      });
    }
    return count;
  }
}
