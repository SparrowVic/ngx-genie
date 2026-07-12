import {GenieServiceRegistration, GenieTreeNode} from '../../../../../../models/genie-node.model';
import {CONSTELLATION_THEME} from '../models/constellation.models';
import {
  ATLAS_FIRST_RING_RADIUS,
  ATLAS_RING_GAP,
  ATLAS_SERVICE_NODE_SPACING,
  ORGANIC_FIRST_SERVICE_RADIUS,
  ORGANIC_SERVICE_BRANCH_BASE,
  ORGANIC_SERVICE_BRANCH_GAP,
  ORGANIC_SERVICE_BRANCH_ROW_GAP,
  ORGANIC_SERVICE_SPACING,
} from './mapper.constants';

/**
 * Leaf helpers shared across the layout builders: scalar math, a stable hash, theme colour lookup,
 * node/service importance scoring, and per-cluster radius estimation. Pure and side-effect free.
 */
export class MapperMetrics {
  static _logScale(value: number, fullAt: number): number {
    if (value <= 0) return 0;
    return this._clamp01(Math.log2(value + 1) / Math.log2(fullAt + 1));
  }

  static _clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  static _stableHash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  static _getThemeColor(type: string): { color: string, glow: string } {
    switch (type) {
      case 'Service':
        return CONSTELLATION_THEME.service;
      case 'Pipe':
        return CONSTELLATION_THEME.pipe;
      case 'Directive':
        return CONSTELLATION_THEME.directive;
      case 'Component':
        return CONSTELLATION_THEME.component;
      case 'Token':
        return CONSTELLATION_THEME.token;
      case 'System':
        return CONSTELLATION_THEME.system;
      case 'Value':
        return CONSTELLATION_THEME.value;
      case 'Observable':
        return CONSTELLATION_THEME.observable;
      case 'Signal':
        return CONSTELLATION_THEME.signal;
      default:
        return CONSTELLATION_THEME.service;
    }
  }

  static _injectorImportance(
    serviceCount: number,
    dependencyCount: number,
    childCount: number,
    isRoot: boolean,
    nodeType: GenieTreeNode['type']
  ): number {
    if (isRoot) return 1;

    const serviceScore = this._logScale(serviceCount, 160);
    const dependencyScore = this._logScale(dependencyCount, 160);
    const childScore = this._logScale(childCount, 24);
    const environmentBonus = nodeType === 'Environment' ? 0.08 : 0;

    return this._clamp01(
      0.12
      + serviceScore * 0.36
      + dependencyScore * 0.34
      + childScore * 0.14
      + environmentBonus
    );
  }

  static _serviceImportance(
    service: GenieServiceRegistration,
    dependencyType: GenieServiceRegistration['dependencyType'],
    usageCount: number,
    isRootScope: boolean,
    isUnused: boolean,
    isFramework: boolean
  ): number {
    const usageScore = this._logScale(usageCount, 120);
    const rootBonus = isRootScope ? 0.24 : 0;
    const appCodeBonus = isFramework ? 0 : 0.12;
    const providerBonus = service.providerType === 'Factory' || service.providerType === 'Existing' ? 0.04 : 0;
    const typeBonus = dependencyType === 'Service' || dependencyType === 'Component' ? 0.04 : 0;
    const unusedPenalty = isUnused ? 0.16 : 0;

    return this._clamp01(
      0.10
      + usageScore * 0.56
      + rootBonus
      + appCodeBonus
      + providerBonus
      + typeBonus
      - unusedPenalty
    );
  }

  static _estimateOrganicClusterRadius(serviceCount: number, importance: number): number {
    if (serviceCount <= 0) return 96 + importance * 72;

    const densitySpacing = ORGANIC_SERVICE_SPACING + Math.min(18, Math.log2(serviceCount + 1) * 2.1);
    const radialEstimate = ORGANIC_FIRST_SERVICE_RADIUS
      + Math.sqrt(serviceCount) * densitySpacing
      + 80
      + importance * 96;
    const columns = Math.max(3, Math.min(18, Math.ceil(Math.sqrt(serviceCount) * 1.45)));
    const rows = Math.ceil(serviceCount / columns);
    const branchDepth = ORGANIC_SERVICE_BRANCH_BASE + Math.max(0, rows - 1) * ORGANIC_SERVICE_BRANCH_ROW_GAP;
    const branchWidth = (columns - 1) * ORGANIC_SERVICE_BRANCH_GAP * 0.5;
    const branchEstimate = Math.hypot(branchDepth, branchWidth) + 130 + importance * 120;

    return Math.max(radialEstimate, branchEstimate);
  }

  static _estimateAtlasClusterRadius(serviceCount: number): number {
    if (serviceCount <= 0) return 72;

    let radius = ATLAS_FIRST_RING_RADIUS;
    let placed = 0;
    while (placed < serviceCount) {
      const capacity = Math.max(8, Math.floor((Math.PI * 2 * radius) / ATLAS_SERVICE_NODE_SPACING));
      placed += capacity;
      if (placed < serviceCount) radius += ATLAS_RING_GAP;
    }

    return radius + 56;
  }
}
