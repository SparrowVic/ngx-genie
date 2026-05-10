import {GenieServiceRegistration, GenieTreeNode} from '../../../../../models/genie-node.model';
import {GenieRegistryService} from '../../../../../services/genie-registry.service';
import {
  CONSTELLATION_THEME,
  ConstellationGraphStats,
  ConstellationLayoutStrategy,
  RenderLink,
  RenderNode
} from './constellation.models';
import {WorkerLink, WorkerNode} from './constellation.worker';
import {GenieFilterState} from '../../../options-panel/options-panel.models';

const HUGE_GRAPH_NODE_THRESHOLD = 3500;
const HUGE_GRAPH_LINK_THRESHOLD = 12000;
const ATLAS_LAYOUT_NODE_THRESHOLD = 1800;
const ATLAS_LAYOUT_LINK_THRESHOLD = 7000;
const SIM_PROVIDER_LINK_LIMIT = 9000;
const SIM_COMPONENT_LINK_LIMIT = 9000;
const SIM_DEPENDENCY_LINK_LIMIT = 2800;
const ATLAS_MAX_RENDERED_PROVIDER_LINKS = 26000;
const ATLAS_MAX_RENDERED_DEPENDENCY_LINKS = 16000;
const ATLAS_MAX_RENDERED_COMPONENT_LINKS = 16000;
const ATLAS_MAX_RENDERED_SERVICE_NODES = 24000;
const ATLAS_MAX_SERVICES_PER_INJECTOR = 320;
const ATLAS_MIN_CELL_SIZE = 420;
const ATLAS_SERVICE_NODE_SPACING = 28;
const ATLAS_RING_GAP = 38;
const ATLAS_FIRST_RING_RADIUS = 76;
const ORGANIC_INJECTOR_SPACING = 260;
const ORGANIC_SERVICE_SPACING = 34;
const ORGANIC_FIRST_SERVICE_RADIUS = 88;
const ORGANIC_MAX_CLUSTER_SPACING_BOOST = 220;

export interface MappedGraphData {
  workerNodes: WorkerNode[];
  workerLinks: WorkerLink[];
  renderNodes: Map<string, RenderNode>;
  renderLinks: RenderLink[];
  stats: ConstellationGraphStats;
}

export class ConstellationMapper {
  static prepareGraphData(
    tree: GenieTreeNode[],
    filterState: GenieFilterState | null,
    registry: GenieRegistryService,
    getServicesForNode: (node: GenieTreeNode) => GenieServiceRegistration[],
    width: number,
    height: number,
    showComponentTree: boolean,
    currentPositions: Map<string, { x: number, y: number }>,
    layoutStrategy: ConstellationLayoutStrategy = 'auto'
  ): MappedGraphData {

    const filteredTree = this._applyDeepSearch(tree, filterState);
    const visibleTreeNodes = this._flattenTree(filteredTree);
    const visibleNodeIds = new Set<number>();
    const visibleServiceIds = new Set<number>();
    for (const node of visibleTreeNodes) visibleNodeIds.add(node.id);

    const allDeps = registry.dependencies();
    const usedProviderIds = new Set<number>();
    allDeps.forEach(dep => {
      if (dep.providerId && visibleNodeIds.has(dep.consumerNodeId)) {
        usedProviderIds.add(dep.providerId);
      }
    });

    const servicesByNodeId = new Map<number, GenieServiceRegistration[]>();
    let providerLinkEstimate = 0;
    let maxServicesPerNode = 0;
    for (const node of visibleTreeNodes) {
      const services = this._filterServicesForNode(getServicesForNode(node), filterState, usedProviderIds);
      servicesByNodeId.set(node.id, services);
      providerLinkEstimate += services.length;
      if (services.length > maxServicesPerNode) maxServicesPerNode = services.length;
      for (const service of services) visibleServiceIds.add(service.id);
    }

    let visibleDependencyLinks = 0;
    const dependencyCountByNodeId = new Map<number, number>();
    const dependencyCountByProviderId = new Map<number, number>();
    allDeps.forEach(dep => {
      if (visibleNodeIds.has(dep.consumerNodeId) && dep.providerId && visibleServiceIds.has(dep.providerId)) {
        visibleDependencyLinks++;
        dependencyCountByNodeId.set(dep.consumerNodeId, (dependencyCountByNodeId.get(dep.consumerNodeId) ?? 0) + 1);
        dependencyCountByProviderId.set(dep.providerId, (dependencyCountByProviderId.get(dep.providerId) ?? 0) + 1);
      }
    });

    const estimatedNodeCount = visibleTreeNodes.length + visibleServiceIds.size;
    const estimatedLinkCount = providerLinkEstimate
      + visibleDependencyLinks
      + (showComponentTree ? Math.max(0, visibleTreeNodes.length - 1) : 0);
    const shouldUseStaticLayout = estimatedNodeCount > ATLAS_LAYOUT_NODE_THRESHOLD
      || estimatedLinkCount > ATLAS_LAYOUT_LINK_THRESHOLD
      || maxServicesPerNode > 250;
    const useOrganicLayout = layoutStrategy === 'organic';
    const useAtlasLayout = layoutStrategy === 'atlas'
      || (layoutStrategy === 'auto' && shouldUseStaticLayout);
    const useStaticLayout = useAtlasLayout || useOrganicLayout;
    const renderServicesByNodeId = new Map<number, GenieServiceRegistration[]>();
    let remainingServiceRenderBudget = useStaticLayout ? ATLAS_MAX_RENDERED_SERVICE_NODES : Number.POSITIVE_INFINITY;
    for (const node of visibleTreeNodes) {
      const services = servicesByNodeId.get(node.id) ?? [];
      const renderServices = useStaticLayout
        ? this._selectAtlasServicesForRender(services, remainingServiceRenderBudget)
        : services;
      renderServicesByNodeId.set(node.id, renderServices);
      remainingServiceRenderBudget -= renderServices.length;
    }

    const workerNodes: WorkerNode[] = [];
    const renderLinks: RenderLink[] = [];
    const nextRenderNodes = new Map<string, RenderNode>();
    const processedIds = new Set<string>();
    const renderedServiceIds = new Set<number>();
    let providerLinks = 0;
    let dependencyLinks = 0;
    let componentLinks = 0;
    let renderedProviderLinks = 0;
    let renderedDependencyLinks = 0;
    let renderedComponentLinks = 0;
    const addRenderLink = (
      sourceId: string,
      targetId: string,
      type: RenderLink['type'],
      shouldRender = true
    ) => {
      if (type === 'provider') providerLinks++;
      else if (type === 'dependency') dependencyLinks++;
      else componentLinks++;

      if (!shouldRender) return;

      renderLinks.push({
        sourceId,
        targetId,
        type,
        uniqueId: `${sourceId}_${targetId}_${type}`
      });

      if (type === 'provider') renderedProviderLinks++;
      else if (type === 'dependency') renderedDependencyLinks++;
      else renderedComponentLinks++;
    };

    const centerX = width / 2;
    const centerY = height / 2;
    const rootComponentId = visibleTreeNodes.length > 0 ? visibleTreeNodes[0].id : -1;
    const staticLayout = useStaticLayout
      ? (
        useOrganicLayout
          ? this._createOrganicLayout(visibleTreeNodes, renderServicesByNodeId, dependencyCountByNodeId, rootComponentId, centerX, centerY)
          : this._createAtlasLayout(visibleTreeNodes, renderServicesByNodeId, centerX, centerY)
      )
      : null;
    let positionIndex = 0;
    const nextInitialPosition = (existing?: { x: number, y: number }) => {
      if (existing) return existing;

      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const index = positionIndex++;
      const radius = 40 + Math.sqrt(index) * 26;
      const angle = index * goldenAngle;

      return {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      };
    };
    visibleTreeNodes.forEach(node => {
      const id = 'inj-' + node.id;

      if (processedIds.has(id)) return;
      processedIds.add(id);

      const position = staticLayout?.injectorPositions.get(node.id)
        ?? nextInitialPosition(currentPositions.get(id));
      const isRootComponent = node.id === rootComponentId;
      const services = servicesByNodeId.get(node.id) ?? [];
      const dependencyCount = dependencyCountByNodeId.get(node.id) ?? 0;
      const importance = this._injectorImportance(
        services.length,
        dependencyCount,
        node.children?.length ?? 0,
        isRootComponent,
        node.type
      );

      const renderNode: RenderNode = {
        id,
        x: position.x,
        y: position.y,
        type: 'injector',
        data: node,
        radius: isRootComponent ? 22 : 16,
        baseColor: isRootComponent ? CONSTELLATION_THEME.root.color : CONSTELLATION_THEME.injector.color,
        glowColor: isRootComponent ? CONSTELLATION_THEME.root.glow : CONSTELLATION_THEME.injector.glow,
        angle: Math.random() * Math.PI * 2,
        meta: {
          label: node.label,
          subLabel: node.type === 'Environment' ? 'ENV' : 'EL',
          dependencyType: 'Injector',
          isRoot: isRootComponent,
          isFramework: false,
          importance,
          clusterSize: services.length
        }
      };
      nextRenderNodes.set(id, renderNode);

      workerNodes.push({
        id,
        x: renderNode.x,
        y: renderNode.y,
        vx: 0, vy: 0,
        mass: isRootComponent ? 35 : 20,
        fixed: useStaticLayout,
        type: 'injector'
      });
    });


    if (showComponentTree) {
      const addHierarchyLinks = (nodes: GenieTreeNode[]) => {
        for (const node of nodes) {
          if (node.children) {
            for (const child of node.children) {
              if (visibleNodeIds.has(node.id) && visibleNodeIds.has(child.id)) {
                const uniqueId = `inj-${node.id}_inj-${child.id}_component-child`;
                const shouldRender = !useStaticLayout
                  || renderedComponentLinks < ATLAS_MAX_RENDERED_COMPONENT_LINKS
                  || this._stableHash(uniqueId) % 19 === 0;
                addRenderLink('inj-' + node.id, 'inj-' + child.id, 'component-child', shouldRender);
              }
            }
            addHierarchyLinks(node.children);
          }
        }
      };
      addHierarchyLinks(filteredTree);
    }

    visibleTreeNodes.forEach(node => {
      const services = servicesByNodeId.get(node.id) ?? [];
      const renderServices = renderServicesByNodeId.get(node.id) ?? services;
      if (renderServices.length < services.length) {
        providerLinks += services.length - renderServices.length;
      }
      const parentId = 'inj-' + node.id;

      renderServices.forEach(svc => {
        const id = 'svc-' + svc.id;

        if (processedIds.has(id)) {
          const uniqueId = `${parentId}_${id}_provider`;
          const shouldRender = !useStaticLayout
            || renderedProviderLinks < ATLAS_MAX_RENDERED_PROVIDER_LINKS
            || this._stableHash(uniqueId) % 23 === 0;
          addRenderLink(parentId, id, 'provider', shouldRender);
          return;
        }
        processedIds.add(id);
        renderedServiceIds.add(svc.id);

        const position = staticLayout?.servicePositions.get(svc.id)
          ?? nextInitialPosition(currentPositions.get(id));
        const depType = svc.dependencyType || 'Service';
        const isRootScope = svc.isRoot || svc.token?.['ɵprov']?.providedIn === 'root';
        const isUnused = !usedProviderIds.has(svc.id);
        const isFramework = svc.isFramework;
        const usageCount = Math.max(svc.usageCount || 0, dependencyCountByProviderId.get(svc.id) ?? 0);
        const importance = this._serviceImportance(svc, depType, usageCount, isRootScope, isUnused, isFramework);

        const themeColor = this._getThemeColor(depType);
        let color = themeColor.color;
        let glow = themeColor.glow;

        if (isRootScope && depType === 'Service') {
          color = CONSTELLATION_THEME.root.color;
          glow = CONSTELLATION_THEME.root.glow;
        }

        const renderNode: RenderNode = {
          id,
          x: position.x,
          y: position.y,
          type: 'service',
          data: svc,
          radius: isRootScope ? 10 : 8,
          baseColor: color,
          glowColor: glow,
          pulseOffset: Math.random() * 100,
          meta: {
            label: svc.label,
            subLabel: svc.providerType,
            dependencyType: depType,
            isRoot: isRootScope,
            isUnused: isUnused,
            isFramework: isFramework,
            importance
          }
        };
        nextRenderNodes.set(id, renderNode);

        workerNodes.push({
          id,
          x: renderNode.x,
          y: renderNode.y,
          vx: 0, vy: 0,
          mass: 5,
          fixed: useStaticLayout,
          type: 'service'
        });

        const uniqueId = `${parentId}_${id}_provider`;
        const shouldRender = !useStaticLayout
          || renderedProviderLinks < ATLAS_MAX_RENDERED_PROVIDER_LINKS
          || this._stableHash(uniqueId) % 23 === 0;
        addRenderLink(parentId, id, 'provider', shouldRender);
      });
    });

    const dependencyRenderStride = useStaticLayout
      ? Math.max(1, Math.ceil(Math.max(visibleDependencyLinks, 1) / ATLAS_MAX_RENDERED_DEPENDENCY_LINKS))
      : 1;
    let seenDependencyLinks = 0;

    allDeps.forEach(dep => {
      if (visibleNodeIds.has(dep.consumerNodeId) && dep.providerId && visibleServiceIds.has(dep.providerId)) {
        const sourceId = 'inj-' + dep.consumerNodeId;
        const targetId = 'svc-' + dep.providerId;
        if (!renderedServiceIds.has(dep.providerId)) {
          addRenderLink(sourceId, targetId, 'dependency', false);
          return;
        }
        const uniqueId = `${sourceId}_${targetId}_dependency`;
        seenDependencyLinks++;
        const shouldRender = !useStaticLayout
          || renderedDependencyLinks < 2500
          || (
            renderedDependencyLinks < ATLAS_MAX_RENDERED_DEPENDENCY_LINKS
            && (seenDependencyLinks % dependencyRenderStride === 0 || this._stableHash(uniqueId) % dependencyRenderStride === 0)
          );
        addRenderLink(sourceId, targetId, 'dependency', shouldRender);
      }
    });

    const workerLinks = useStaticLayout ? [] : this._selectSimulationLinks(renderLinks, workerNodes.length);
    const totalLinks = providerLinks + dependencyLinks + componentLinks;
    const stats: ConstellationGraphStats = {
      nodes: estimatedNodeCount,
      renderedNodes: workerNodes.length,
      links: totalLinks,
      renderedLinks: renderLinks.length,
      providerLinks,
      dependencyLinks,
      componentLinks,
      simulationLinks: workerLinks.length,
      hiddenSimulationLinks: Math.max(0, renderLinks.length - workerLinks.length),
      isHuge: workerNodes.length > HUGE_GRAPH_NODE_THRESHOLD || totalLinks > HUGE_GRAPH_LINK_THRESHOLD,
      layoutMode: useOrganicLayout ? 'organic' : useAtlasLayout ? 'atlas' : 'force'
    };

    return {workerNodes, workerLinks, renderNodes: nextRenderNodes, renderLinks, stats};
  }

  private static _injectorImportance(
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

  private static _serviceImportance(
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

  private static _logScale(value: number, fullAt: number): number {
    if (value <= 0) return 0;
    return this._clamp01(Math.log2(value + 1) / Math.log2(fullAt + 1));
  }

  private static _clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private static _selectSimulationLinks(renderLinks: RenderLink[], nodeCount: number): WorkerLink[] {
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
          || this._stableHash(link.uniqueId) % 17 === 0
        ) {
          workerLinks.push(link);
          providerCount++;
        }
        continue;
      }

      seenDependencyLinks++;
      if (
        dependencyCount < dependencyLimit
        && (seenDependencyLinks < 700 || this._stableHash(link.uniqueId) % dependencyStride === 0)
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

  private static _filterServicesForNode(
    services: GenieServiceRegistration[],
    filterState: GenieFilterState | null,
    usedProviderIds: Set<number>
  ): GenieServiceRegistration[] {
    if (!filterState) return services;

    return services.filter(s => {
      const isFramework = s.isFramework;
      if (filterState.hideInternals && isFramework) return false;

      const type = s.dependencyType || 'Service';

      if (isFramework) {
        if (type === 'Service' && !filterState.showFrameworkServices) return false;
        if (type === 'System' && !filterState.showFrameworkSystem) return false;
        if (type === 'Pipe' && !filterState.showFrameworkPipes) return false;
        if (type === 'Directive' && !filterState.showFrameworkDirectives) return false;
        if (type === 'Component' && !filterState.showFrameworkComponents) return false;
        if (type === 'Token' && !filterState.showFrameworkTokens) return false;
        if (type === 'Observable' && !filterState.showFrameworkObservables) return false;
        if (type === 'Signal' && !filterState.showFrameworkSignals) return false;
      } else {
        if (type === 'Service' && !filterState.showUserServices) return false;
        if (type === 'Pipe' && !filterState.showUserPipes) return false;
        if (type === 'Directive' && !filterState.showUserDirectives) return false;
        if (type === 'Component' && !filterState.showUserComponents) return false;
        if (type === 'Token' && !filterState.showUserTokens) return false;
        if (type === 'Value' && !filterState.showUserValues) return false;
        if (type === 'Observable' && !filterState.showUserObservables) return false;
        if (type === 'Signal' && !filterState.showUserSignals) return false;
      }

      if (filterState.showRootOnly && !s.isRoot) return false;
      if (filterState.showLocalOnly && s.isRoot) return false;
      if (filterState.hideUnusedDeps && !usedProviderIds.has(s.id)) return false;

      return true;
    });
  }

  private static _selectAtlasServicesForRender(
    services: GenieServiceRegistration[],
    remainingGlobalBudget: number
  ): GenieServiceRegistration[] {
    const limit = Math.min(ATLAS_MAX_SERVICES_PER_INJECTOR, Math.max(0, Math.floor(remainingGlobalBudget)));
    if (limit <= 0) return [];
    if (services.length <= limit) return services;

    const selected: GenieServiceRegistration[] = [];
    const selectedIds = new Set<number>();
    const priorityLimit = Math.max(48, Math.floor(limit * 0.45));

    for (const service of services) {
      if (selected.length >= priorityLimit) break;
      if (service.isRoot || (service.usageCount || 0) > 0 || !service.isFramework) {
        selected.push(service);
        selectedIds.add(service.id);
      }
    }

    const remaining = limit - selected.length;
    if (remaining <= 0) return selected;

    const stride = Math.max(1, Math.ceil(services.length / remaining));
    let cursor = 0;

    while (selected.length < limit && cursor < services.length) {
      const service = services[cursor];
      if (!selectedIds.has(service.id)) {
        selected.push(service);
        selectedIds.add(service.id);
      }
      cursor += stride;
    }

    cursor = 0;
    while (selected.length < limit && cursor < services.length) {
      const service = services[cursor++];
      if (selectedIds.has(service.id)) continue;
      selected.push(service);
      selectedIds.add(service.id);
    }

    return selected;
  }

  private static _createAtlasLayout(
    nodes: GenieTreeNode[],
    servicesByNodeId: Map<number, GenieServiceRegistration[]>,
    centerX: number,
    centerY: number
  ): {
    injectorPositions: Map<number, { x: number; y: number }>;
    servicePositions: Map<number, { x: number; y: number }>;
  } {
    const injectorPositions = new Map<number, { x: number; y: number }>();
    const servicePositions = new Map<number, { x: number; y: number }>();

    let maxClusterRadius = ATLAS_MIN_CELL_SIZE / 2;
    for (const services of servicesByNodeId.values()) {
      maxClusterRadius = Math.max(maxClusterRadius, this._estimateAtlasClusterRadius(services.length));
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

  private static _createOrganicLayout(
    nodes: GenieTreeNode[],
    servicesByNodeId: Map<number, GenieServiceRegistration[]>,
    dependencyCountByNodeId: Map<number, number>,
    rootNodeId: number,
    centerX: number,
    centerY: number
  ): {
    injectorPositions: Map<number, { x: number; y: number }>;
    servicePositions: Map<number, { x: number; y: number }>;
  } {
    const injectorPositions = new Map<number, { x: number; y: number }>();
    const servicePositions = new Map<number, { x: number; y: number }>();

    const rankedNodes = nodes
      .map((node, originalIndex) => {
        const services = servicesByNodeId.get(node.id) ?? [];
        const importance = this._injectorImportance(
          services.length,
          dependencyCountByNodeId.get(node.id) ?? 0,
          node.children?.length ?? 0,
          node.id === rootNodeId,
          node.type
        );

        return {
          node,
          services,
          originalIndex,
          importance,
          clusterRadius: this._estimateOrganicClusterRadius(services.length, importance)
        };
      })
      .sort((a, b) => {
        if (a.node.id === rootNodeId) return -1;
        if (b.node.id === rootNodeId) return 1;
        const importanceDiff = b.importance - a.importance;
        if (Math.abs(importanceDiff) > 0.001) return importanceDiff;
        return a.originalIndex - b.originalIndex;
      });

    rankedNodes.forEach(({node, services, importance, clusterRadius}, index) => {
      const position = this._organicInjectorPosition(centerX, centerY, index, node.id, clusterRadius, importance);
      injectorPositions.set(node.id, position);

      services.forEach((service, serviceIndex) => {
        if (servicePositions.has(service.id)) return;
        servicePositions.set(
          service.id,
          this._organicServicePosition(position, serviceIndex, service.id, services.length)
        );
      });
    });

    return {injectorPositions, servicePositions};
  }

  private static _organicInjectorPosition(
    centerX: number,
    centerY: number,
    index: number,
    nodeId: number,
    clusterRadius: number,
    importance: number
  ): { x: number; y: number } {
    if (index === 0) return {x: centerX, y: centerY};

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const hash = this._stableHash(String(nodeId));
    const angle = index * goldenAngle + (hash % 1000) / 1000 * 0.38;
    const spacing = ORGANIC_INJECTOR_SPACING
      + Math.min(ORGANIC_MAX_CLUSTER_SPACING_BOOST, clusterRadius * 0.34)
      + importance * 80;
    const radius = Math.sqrt(index) * spacing + 160 + clusterRadius * 0.42 + (hash % 90);
    const wobbleA = Math.sin(index * 0.41 + hash * 0.0001) * 70;
    const wobbleB = Math.cos(index * 0.27 + hash * 0.0002) * 70;

    return {
      x: centerX + Math.cos(angle) * radius + wobbleA,
      y: centerY + Math.sin(angle) * radius * 0.82 + wobbleB
    };
  }

  private static _organicServicePosition(
    parent: { x: number; y: number },
    index: number,
    serviceId: number,
    serviceCount: number
  ): { x: number; y: number } {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const hash = this._stableHash(String(serviceId));
    const angle = index * goldenAngle + (hash % 1000) / 1000 * Math.PI * 2;
    const densitySpacing = ORGANIC_SERVICE_SPACING + Math.min(18, Math.log2(serviceCount + 1) * 2.1);
    const radius = ORGANIC_FIRST_SERVICE_RADIUS
      + Math.sqrt(index) * densitySpacing
      + (hash % 26);
    const wobbleA = Math.sin(hash * 0.003 + index * 0.73) * 10;
    const wobbleB = Math.cos(hash * 0.002 + index * 0.59) * 10;

    return {
      x: parent.x + Math.cos(angle) * radius + wobbleA,
      y: parent.y + Math.sin(angle) * radius + wobbleB
    };
  }

  private static _estimateOrganicClusterRadius(serviceCount: number, importance: number): number {
    if (serviceCount <= 0) return 96 + importance * 72;

    const densitySpacing = ORGANIC_SERVICE_SPACING + Math.min(18, Math.log2(serviceCount + 1) * 2.1);
    return ORGANIC_FIRST_SERVICE_RADIUS
      + Math.sqrt(serviceCount) * densitySpacing
      + 80
      + importance * 96;
  }

  private static _estimateAtlasClusterRadius(serviceCount: number): number {
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

  private static _serviceAtlasPosition(
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
        const hashOffset = (this._stableHash(String(serviceId)) % 360) * (Math.PI / 180);
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

  private static _squareSpiralCoordinate(index: number): { x: number; y: number } {
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

  private static _applyDeepSearch(tree: GenieTreeNode[], filters: GenieFilterState | null): GenieTreeNode[] {
    if (!filters) return tree;
    const compTags = filters.componentTags || [];
    const hasCompFilter = compTags.length > 0;

    if (!hasCompFilter) return tree;

    const filterNode = (node: GenieTreeNode): GenieTreeNode | null => {
      let matchesComp = compTags.includes(node.label);

      const matchingChildren: GenieTreeNode[] = [];
      if (node.children) {
        for (const child of node.children) {
          const filteredChild = filterNode(child);
          if (filteredChild) matchingChildren.push(filteredChild);
        }
      }
      if (matchesComp || matchingChildren.length > 0) {
        return {...node, children: matchingChildren};
      }
      return null;
    };

    const result: GenieTreeNode[] = [];
    for (const rootNode of tree) {
      const filtered = filterNode(rootNode);
      if (filtered) result.push(filtered);
    }
    return result;
  }

  private static _flattenTree(nodes: GenieTreeNode[]): GenieTreeNode[] {
    const result: GenieTreeNode[] = [];
    const stack = [...nodes].reverse();

    while (stack.length > 0) {
      const node = stack.pop()!;
      result.push(node);

      if (node.children?.length) {
        for (let index = node.children.length - 1; index >= 0; index--) {
          stack.push(node.children[index]);
        }
      }
    }

    return result;
  }

  private static _stableHash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private static _getThemeColor(type: string): { color: string, glow: string } {
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
}
