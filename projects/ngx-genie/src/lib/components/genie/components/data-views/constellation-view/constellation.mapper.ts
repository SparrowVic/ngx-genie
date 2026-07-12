import {GenieDependency, GenieServiceRegistration, GenieTreeNode} from '../../../../../models/genie-node.model';
import {
  CONSTELLATION_THEME,
  ConstellationGroupingStrategy,
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
const ATLAS_MAX_RENDERED_AGGREGATE_LINKS = 9000;
const ATLAS_MAX_RENDERED_SERVICE_NODES = 24000;
const ATLAS_MAX_SERVICES_PER_INJECTOR = 320;
const ATLAS_MIN_CELL_SIZE = 420;
const ATLAS_SERVICE_NODE_SPACING = 28;
const ATLAS_RING_GAP = 38;
const ATLAS_FIRST_RING_RADIUS = 76;
const ORGANIC_INJECTOR_SPACING = 360;
const ORGANIC_SERVICE_SPACING = 34;
const ORGANIC_FIRST_SERVICE_RADIUS = 88;
const ORGANIC_SERVICE_BRANCH_BASE = 700;
const ORGANIC_SERVICE_BRANCH_GAP = 148;
const ORGANIC_SERVICE_BRANCH_ROW_GAP = 300;
const ORGANIC_MAX_CLUSTER_SPACING_BOOST = 620;
const ORGANIC_GROUP_SPACING = 7600;
const ORGANIC_GROUP_GAP = 4300;
const ORGANIC_GROUP_RING_GAP = 5200;
const ORGANIC_GROUP_MAX_RING_BOOST = 1500;
const ORGANIC_GROUP_MIN_RADIUS = 2200;
const ORGANIC_SUBGROUP_GAP = 1320;
const ORGANIC_SUBGROUP_MIN_RADIUS = 840;

export interface MappedGraphData {
  workerNodes: WorkerNode[];
  workerLinks: WorkerLink[];
  renderNodes: Map<string, RenderNode>;
  renderLinks: RenderLink[];
  stats: ConstellationGraphStats;
}

interface VisibleDependency {
  consumerNodeId: number;
  providerId: number;
}

interface AggregatedDependencyLink {
  sourceId: string;
  targetId: string;
  count: number;
  sortKey: number;
}

interface AggregatedDependencySummary {
  total: number;
  renderedLinks: AggregatedDependencyLink[];
}

interface OrganicGroupAssignment {
  key: string;
  label: string;
  index: number;
  memberCount: number;
  center: { x: number; y: number };
  radius: number;
  colorSeed: number;
  subgroupKey?: string;
  subgroupLabel?: string;
  subgroupIndex?: number;
  subgroupMemberCount?: number;
  subgroupCenter?: { x: number; y: number };
  subgroupRadius?: number;
}

interface StaticLayoutResult {
  injectorPositions: Map<number, { x: number; y: number }>;
  servicePositions: Map<number, { x: number; y: number }>;
  injectorGroups?: Map<number, OrganicGroupAssignment>;
  serviceGroups?: Map<number, OrganicGroupAssignment>;
}

interface OrganicRankedNode {
  node: GenieTreeNode;
  services: GenieServiceRegistration[];
  originalIndex: number;
  importance: number;
  clusterRadius: number;
  groupKey: string;
  groupLabel: string;
  subgroupKey: string;
  subgroupLabel: string;
}

interface OrganicServiceRankedNode {
  service: GenieServiceRegistration;
  ownerNodeId: number;
  originalIndex: number;
  importance: number;
  clusterRadius: number;
  groupKey: string;
  groupLabel: string;
  subgroupKey: string;
  subgroupLabel: string;
}

interface OrganicGroup {
  key: string;
  label: string;
  members: OrganicRankedNode[];
  radius: number;
  importance: number;
}

interface OrganicSubgroup {
  key: string;
  label: string;
  members: OrganicRankedNode[];
  radius: number;
  importance: number;
}

interface OrganicServiceGroup {
  key: string;
  label: string;
  members: OrganicServiceRankedNode[];
  radius: number;
  importance: number;
}

interface OrganicServiceSubgroup {
  key: string;
  label: string;
  members: OrganicServiceRankedNode[];
  radius: number;
  importance: number;
}

export class ConstellationMapper {
  static prepareGraphData(
    tree: GenieTreeNode[],
    filterState: GenieFilterState | null,
    dependencies: readonly GenieDependency[],
    getServicesForNode: (node: GenieTreeNode) => GenieServiceRegistration[],
    width: number,
    height: number,
    showComponentTree: boolean,
    currentPositions: Map<string, { x: number, y: number }>,
    layoutStrategy: ConstellationLayoutStrategy = 'auto',
    groupingStrategy: ConstellationGroupingStrategy = 'auto',
    forceShown: (label: string) => boolean = () => false
  ): MappedGraphData {

    const filteredTree = this._applyDeepSearch(tree, filterState);
    const visibleTreeNodes = this._flattenTree(filteredTree);
    const visibleNodeIds = new Set<number>();
    const visibleServiceIds = new Set<number>();
    for (const node of visibleTreeNodes) visibleNodeIds.add(node.id);

    const allDeps = dependencies;
    const usedProviderIds = new Set<number>();
    for (const dep of allDeps) {
      if (dep.providerId !== null && visibleNodeIds.has(dep.consumerNodeId)) {
        usedProviderIds.add(dep.providerId);
      }
    }

    const servicesByNodeId = new Map<number, GenieServiceRegistration[]>();
    const providerOwnerNodeIdByServiceId = new Map<number, number>();
    let providerLinkEstimate = 0;
    let maxServicesPerNode = 0;
    for (const node of visibleTreeNodes) {
      const services = this._filterServicesForNode(getServicesForNode(node), filterState, usedProviderIds, forceShown);
      servicesByNodeId.set(node.id, services);
      providerLinkEstimate += services.length;
      if (services.length > maxServicesPerNode) maxServicesPerNode = services.length;
      for (const service of services) {
        visibleServiceIds.add(service.id);
        providerOwnerNodeIdByServiceId.set(service.id, node.id);
      }
    }

    let visibleDependencyLinks = 0;
    const visibleDependencies: VisibleDependency[] = [];
    const dependencyCountByNodeId = new Map<number, number>();
    const dependencyCountByProviderId = new Map<number, number>();
    for (const dep of allDeps) {
      const providerId = dep.providerId;
      if (providerId === null) continue;
      if (!visibleNodeIds.has(dep.consumerNodeId) || !visibleServiceIds.has(providerId)) continue;

      visibleDependencyLinks++;
      visibleDependencies.push({
        consumerNodeId: dep.consumerNodeId,
        providerId
      });
      dependencyCountByNodeId.set(dep.consumerNodeId, (dependencyCountByNodeId.get(dep.consumerNodeId) ?? 0) + 1);
      dependencyCountByProviderId.set(providerId, (dependencyCountByProviderId.get(providerId) ?? 0) + 1);
    }

    const estimatedNodeCount = visibleTreeNodes.length + visibleServiceIds.size;
    const estimatedLinkCount = providerLinkEstimate
      + visibleDependencyLinks
      + (showComponentTree ? Math.max(0, visibleTreeNodes.length - 1) : 0);
    const shouldUseStaticLayout = estimatedNodeCount > ATLAS_LAYOUT_NODE_THRESHOLD
      || estimatedLinkCount > ATLAS_LAYOUT_LINK_THRESHOLD
      || maxServicesPerNode > 250;
    const shouldUseGroupedOrganicLayout = layoutStrategy === 'auto'
      && groupingStrategy !== 'none'
      && (shouldUseStaticLayout || showComponentTree || estimatedNodeCount > 900);
    const useOrganicLayout = layoutStrategy === 'organic' || shouldUseGroupedOrganicLayout;
    const useAtlasLayout = layoutStrategy === 'atlas'
      || (layoutStrategy === 'auto' && shouldUseStaticLayout && !useOrganicLayout);
    const useStaticLayout = useAtlasLayout || useOrganicLayout;
    const effectiveGroupingStrategy = this._resolveGroupingStrategy(groupingStrategy, useOrganicLayout, estimatedNodeCount);
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
    let aggregateLinks = 0;
    let renderedProviderLinks = 0;
    let renderedDependencyLinks = 0;
    let renderedComponentLinks = 0;
    const addRenderLink = (
      sourceId: string,
      targetId: string,
      type: RenderLink['type'],
      shouldRender = true,
      weight?: number
    ) => {
      if (type === 'provider') providerLinks++;
      else if (type === 'dependency') dependencyLinks++;
      else if (type === 'component-child') componentLinks++;
      else aggregateLinks++;

      if (!shouldRender) return;

      renderLinks.push({
        sourceId,
        targetId,
        type,
        uniqueId: `${sourceId}_${targetId}_${type}`,
        weight
      });

      if (type === 'provider') renderedProviderLinks++;
      else if (type === 'dependency') renderedDependencyLinks++;
      else if (type === 'component-child') renderedComponentLinks++;
    };

    const centerX = width / 2;
    const centerY = height / 2;
    const rootComponentId = visibleTreeNodes.length > 0 ? visibleTreeNodes[0].id : -1;
    const staticLayout = useStaticLayout
      ? (
        useOrganicLayout
          ? this._createOrganicLayout(
            visibleTreeNodes,
            renderServicesByNodeId,
            dependencyCountByNodeId,
            rootComponentId,
            centerX,
            centerY,
            effectiveGroupingStrategy,
            usedProviderIds
          )
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
      const groupAssignment = staticLayout?.injectorGroups?.get(node.id);

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
          clusterSize: services.length,
          groupKey: groupAssignment?.key,
          groupLabel: groupAssignment?.label,
          groupIndex: groupAssignment?.index,
          groupMemberCount: groupAssignment?.memberCount,
          groupCenterX: groupAssignment?.center.x,
          groupCenterY: groupAssignment?.center.y,
          groupRadius: groupAssignment?.radius,
          groupColorSeed: groupAssignment?.colorSeed,
          subgroupKey: groupAssignment?.subgroupKey,
          subgroupLabel: groupAssignment?.subgroupLabel,
          subgroupIndex: groupAssignment?.subgroupIndex,
          subgroupMemberCount: groupAssignment?.subgroupMemberCount,
          subgroupCenterX: groupAssignment?.subgroupCenter?.x,
          subgroupCenterY: groupAssignment?.subgroupCenter?.y,
          subgroupRadius: groupAssignment?.subgroupRadius
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
      const hierarchyStack = [...filteredTree];
      while (hierarchyStack.length > 0) {
        const node = hierarchyStack.pop()!;
        const children = node.children ?? [];

        for (const child of children) {
          if (visibleNodeIds.has(node.id) && visibleNodeIds.has(child.id)) {
            const uniqueId = `inj-${node.id}_inj-${child.id}_component-child`;
            const shouldRender = !useStaticLayout
              || renderedComponentLinks < ATLAS_MAX_RENDERED_COMPONENT_LINKS
              || this._stableHash(uniqueId) % 19 === 0;
            addRenderLink('inj-' + node.id, 'inj-' + child.id, 'component-child', shouldRender);
          }
          hierarchyStack.push(child);
        }
      }
    }

    if (useStaticLayout) {
      const aggregateSummary = this._aggregateDependencySummary(
        visibleDependencies,
        providerOwnerNodeIdByServiceId
      );
      aggregateLinks = aggregateSummary.total;

      for (const link of aggregateSummary.renderedLinks) {
        const uniqueId = `${link.sourceId}_${link.targetId}_aggregate-dependency`;
        renderLinks.push({
          sourceId: link.sourceId,
          targetId: link.targetId,
          type: 'aggregate-dependency',
          uniqueId,
          weight: link.count
        });
      }
    }

    for (const node of visibleTreeNodes) {
      const services = servicesByNodeId.get(node.id) ?? [];
      const renderServices = renderServicesByNodeId.get(node.id) ?? services;
      if (renderServices.length < services.length) {
        providerLinks += services.length - renderServices.length;
      }
      const parentId = 'inj-' + node.id;

      for (const svc of renderServices) {
        const id = 'svc-' + svc.id;

        if (processedIds.has(id)) {
          const uniqueId = `${parentId}_${id}_provider`;
          const shouldRender = !useStaticLayout
            || renderedProviderLinks < ATLAS_MAX_RENDERED_PROVIDER_LINKS
            || this._stableHash(uniqueId) % 23 === 0;
          addRenderLink(parentId, id, 'provider', shouldRender);
          continue;
        }
        processedIds.add(id);
        renderedServiceIds.add(svc.id);

        const position = staticLayout?.servicePositions.get(svc.id)
          ?? nextInitialPosition(currentPositions.get(id));
        const groupAssignment = staticLayout?.serviceGroups?.get(svc.id);
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
            importance,
            groupKey: groupAssignment?.key,
            groupLabel: groupAssignment?.label,
            groupIndex: groupAssignment?.index,
            groupMemberCount: groupAssignment?.memberCount,
            groupCenterX: groupAssignment?.center.x,
            groupCenterY: groupAssignment?.center.y,
            groupRadius: groupAssignment?.radius,
            groupColorSeed: groupAssignment?.colorSeed,
            subgroupKey: groupAssignment?.subgroupKey,
            subgroupLabel: groupAssignment?.subgroupLabel,
            subgroupIndex: groupAssignment?.subgroupIndex,
            subgroupMemberCount: groupAssignment?.subgroupMemberCount,
            subgroupCenterX: groupAssignment?.subgroupCenter?.x,
            subgroupCenterY: groupAssignment?.subgroupCenter?.y,
            subgroupRadius: groupAssignment?.subgroupRadius
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
      }
    }

    const dependencyRenderStride = useStaticLayout
      ? Math.max(1, Math.ceil(Math.max(visibleDependencyLinks, 1) / ATLAS_MAX_RENDERED_DEPENDENCY_LINKS))
      : 1;
    let seenDependencyLinks = 0;

    for (const dep of visibleDependencies) {
      const sourceId = 'inj-' + dep.consumerNodeId;
      const targetId = 'svc-' + dep.providerId;
      if (!renderedServiceIds.has(dep.providerId)) {
        addRenderLink(sourceId, targetId, 'dependency', false);
        continue;
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

    const workerLinks = useStaticLayout ? [] : this._selectSimulationLinks(renderLinks, workerNodes.length);
    const totalLinks = providerLinks + dependencyLinks + componentLinks + aggregateLinks;
    const stats: ConstellationGraphStats = {
      nodes: estimatedNodeCount,
      renderedNodes: workerNodes.length,
      links: totalLinks,
      renderedLinks: renderLinks.length,
      providerLinks,
      dependencyLinks,
      componentLinks,
      aggregateLinks,
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

  private static _resolveGroupingStrategy(
    groupingStrategy: ConstellationGroupingStrategy,
    useOrganicLayout: boolean,
    estimatedNodeCount: number
  ): Exclude<ConstellationGroupingStrategy, 'auto'> {
    if (groupingStrategy === 'type') return 'node-type';
    if (
      groupingStrategy === 'node-type'
      || groupingStrategy === 'scope'
      || groupingStrategy === 'tree'
      || groupingStrategy === 'none'
    ) {
      return groupingStrategy;
    }

    if (!useOrganicLayout) return 'none';
    return estimatedNodeCount > 1200 ? 'node-type' : 'none';
  }

  private static _logScale(value: number, fullAt: number): number {
    if (value <= 0) return 0;
    return this._clamp01(Math.log2(value + 1) / Math.log2(fullAt + 1));
  }

  private static _clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private static _aggregateDependencySummary(
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
          sortKey: this._stableHash(key)
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

      if (link.type === 'aggregate-dependency') continue;

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
    usedProviderIds: Set<number>,
    forceShown: (label: string) => boolean = () => false
  ): GenieServiceRegistration[] {
    if (!filterState) return services;

    return services.filter(s => {
      if (filterState.showRootOnly && !s.isRoot) return false;
      if (filterState.showLocalOnly && s.isRoot) return false;
      if (filterState.hideUnusedDeps && !usedProviderIds.has(s.id)) return false;

      // A token the user pinned visible (Advanced config → "Show") bypasses the internal + per-type
      // gates, matching explorer-state._serviceMatchesFilters so the constellation agrees with the tree.
      if (forceShown(s.label)) return true;

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
  ): StaticLayoutResult {
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
    centerY: number,
    groupingStrategy: Exclude<ConstellationGroupingStrategy, 'auto'>,
    usedProviderIds: Set<number>
  ): StaticLayoutResult {
    const injectorPositions = new Map<number, { x: number; y: number }>();
    const servicePositions = new Map<number, { x: number; y: number }>();
    const injectorGroups = new Map<number, OrganicGroupAssignment>();
    const serviceGroups = new Map<number, OrganicGroupAssignment>();
    const nodeById = new Map<number, GenieTreeNode>();
    for (const node of nodes) nodeById.set(node.id, node);

    const rankedNodes: OrganicRankedNode[] = nodes
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
          clusterRadius: this._estimateOrganicClusterRadius(services.length, importance),
          groupKey: this._organicGroupingKey(node, rootNodeId, nodeById, groupingStrategy),
          groupLabel: this._organicGroupingLabel(node, rootNodeId, nodeById, groupingStrategy),
          subgroupKey: this._organicSubgroupingKey(node, rootNodeId, nodeById, groupingStrategy),
          subgroupLabel: this._organicSubgroupingLabel(node, rootNodeId, nodeById, groupingStrategy)
        };
      })
      .sort((a, b) => {
        if (a.node.id === rootNodeId) return -1;
        if (b.node.id === rootNodeId) return 1;
        const importanceDiff = b.importance - a.importance;
        if (Math.abs(importanceDiff) > 0.001) return importanceDiff;
        return a.originalIndex - b.originalIndex;
      });

    if (groupingStrategy !== 'none') {
      const rootEntry = rankedNodes.find(entry => entry.node.id === rootNodeId) ?? rankedNodes[0];
      if (rootEntry) {
        injectorPositions.set(rootEntry.node.id, {x: centerX, y: centerY});
      }

      const useDetachedServiceGroups = groupingStrategy === 'node-type'
        || groupingStrategy === 'scope'
        || groupingStrategy === 'type';
      const groups = this._buildOrganicGroups(rankedNodes, rootNodeId);
      const serviceEntries = useDetachedServiceGroups
        ? this._buildOrganicServiceEntries(rankedNodes, servicesByNodeId, groupingStrategy, usedProviderIds)
        : [];
      const serviceLayoutGroups = useDetachedServiceGroups
        ? this._buildOrganicServiceGroups(serviceEntries)
        : [];
      const groupCenters = this._organicGroupCenters(centerX, centerY, [...groups, ...serviceLayoutGroups]);
      groups.forEach((group, groupIndex) => {
        const groupRegion = groupCenters.get(group.key);
        if (!groupRegion) return;
        this._placeOrganicGroupMembers(
          group,
          groupIndex,
          groupRegion,
          injectorPositions,
          injectorGroups
        );
      });
      serviceLayoutGroups.forEach((group, groupIndex) => {
        const groupRegion = groupCenters.get(group.key);
        if (!groupRegion) return;
        this._placeOrganicServiceGroupMembers(
          group,
          groups.length + groupIndex,
          groupRegion,
          servicePositions,
          serviceGroups
        );
      });

      if (rootEntry) {
        const rootAssignment: OrganicGroupAssignment = {
          key: 'root',
          label: 'ROOT',
          index: -1,
          memberCount: 1,
          center: {x: centerX, y: centerY},
          radius: ORGANIC_GROUP_MIN_RADIUS * 0.72,
          colorSeed: this._stableHash('root')
        };
        injectorGroups.set(rootEntry.node.id, rootAssignment);
      }
    } else {
      rankedNodes.forEach(({node, importance, clusterRadius}, index) => {
        const position = this._organicInjectorPosition(centerX, centerY, index, node.id, clusterRadius, importance);
        injectorPositions.set(node.id, position);
      });
    }

    rankedNodes.forEach(({node, services}) => {
      const position = injectorPositions.get(node.id) ?? {x: centerX, y: centerY};
      const groupAssignment = injectorGroups.get(node.id);
      const branchAngle = this._organicServiceBranchAngle(position, groupAssignment, node.id);
      services.forEach((service, serviceIndex) => {
        if (servicePositions.has(service.id)) return;
        servicePositions.set(
          service.id,
          this._organicServicePosition(position, serviceIndex, service.id, services.length, branchAngle)
        );
        if (groupAssignment) serviceGroups.set(service.id, groupAssignment);
      });
    });

    return {injectorPositions, servicePositions, injectorGroups, serviceGroups};
  }

  private static _organicGroupingKey(
    node: GenieTreeNode,
    rootNodeId: number,
    nodeById: Map<number, GenieTreeNode>,
    groupingStrategy: Exclude<ConstellationGroupingStrategy, 'auto'>
  ): string {
    if (groupingStrategy === 'none') return 'all';
    if (node.id === rootNodeId) return 'root';
    if (groupingStrategy === 'node-type' || groupingStrategy === 'type') return 'node-type:injector';
    if (groupingStrategy === 'scope') return 'scope:injector';

    const path = this._pathFromRoot(node, rootNodeId, nodeById);
    const current = path[this._semanticGroupAnchorIndex(path)] ?? node;

    return `tree:${current.id}`;
  }

  private static _organicGroupingLabel(
    node: GenieTreeNode,
    rootNodeId: number,
    nodeById: Map<number, GenieTreeNode>,
    groupingStrategy: Exclude<ConstellationGroupingStrategy, 'auto'>
  ): string {
    void nodeById;
    if (node.id === rootNodeId) return 'ROOT';
    if (groupingStrategy === 'node-type' || groupingStrategy === 'type') return 'Injector / Node';
    if (groupingStrategy === 'scope') return 'Injector / Node';
    return node.label;
  }

  private static _organicSubgroupingKey(
    node: GenieTreeNode,
    rootNodeId: number,
    nodeById: Map<number, GenieTreeNode>,
    groupingStrategy: Exclude<ConstellationGroupingStrategy, 'auto'>
  ): string {
    if (groupingStrategy === 'none') return 'all';
    if (node.id === rootNodeId) return 'root';
    if (groupingStrategy === 'node-type' || groupingStrategy === 'type') {
      return `node-type:injector:${this._normalizeGroupPart(node.label)}`;
    }
    if (groupingStrategy === 'scope') {
      return `scope:injector:${this._normalizeGroupPart(node.type)}:${this._normalizeGroupPart(node.label)}`;
    }

    const path = this._pathFromRoot(node, rootNodeId, nodeById);
    if (path.length === 0) return `tree:${node.id}`;

    const groupAnchorIndex = this._semanticGroupAnchorIndex(path);
    const subgroupAnchor = path[Math.min(path.length - 1, groupAnchorIndex + 1)] ?? path[groupAnchorIndex] ?? node;

    return `subtree:${subgroupAnchor.id}`;
  }

  private static _organicSubgroupingLabel(
    node: GenieTreeNode,
    rootNodeId: number,
    nodeById: Map<number, GenieTreeNode>,
    groupingStrategy: Exclude<ConstellationGroupingStrategy, 'auto'>
  ): string {
    if (node.id === rootNodeId) return 'ROOT';
    if (groupingStrategy === 'node-type' || groupingStrategy === 'type') return node.label;
    if (groupingStrategy === 'scope') return `${node.type} / ${node.label}`;

    const path = this._pathFromRoot(node, rootNodeId, nodeById);
    if (path.length === 0) return node.label;
    const groupAnchorIndex = this._semanticGroupAnchorIndex(path);
    const subgroupAnchor = path[Math.min(path.length - 1, groupAnchorIndex + 1)] ?? path[groupAnchorIndex] ?? node;
    return subgroupAnchor.label;
  }

  private static _pathFromRoot(
    node: GenieTreeNode,
    rootNodeId: number,
    nodeById: Map<number, GenieTreeNode>
  ): GenieTreeNode[] {
    const path: GenieTreeNode[] = [];
    let current: GenieTreeNode | undefined = node;
    let guard = 0;

    while (current && current.id !== rootNodeId && guard < 300) {
      path.push(current);
      current = current.parentId === null ? undefined : nodeById.get(current.parentId);
      guard++;
    }

    return path.reverse();
  }

  private static _semanticGroupAnchorIndex(path: GenieTreeNode[]): number {
    if (path.length <= 1) return 0;

    const first = path[0];
    const firstLabel = first.label.toLowerCase();
    const isAppShell = firstLabel === '_app'
      || firstLabel === 'app'
      || firstLabel.includes('appcomponent')
      || firstLabel.includes('root')
      || first.children.length > 32;

    if (isAppShell && path.length > 1) return 1;
    return 0;
  }

  private static _buildOrganicGroups(
    rankedNodes: OrganicRankedNode[],
    rootNodeId: number
  ): OrganicGroup[] {
    const groupsByKey = new Map<string, OrganicRankedNode[]>();

    for (const entry of rankedNodes) {
      if (entry.node.id === rootNodeId) continue;
      const group = groupsByKey.get(entry.groupKey);
      if (group) {
        group.push(entry);
      } else {
        groupsByKey.set(entry.groupKey, [entry]);
      }
    }

    return Array.from(groupsByKey.entries())
      .map(([key, members]) => {
        const area = members.reduce((sum, member) => sum + Math.PI * member.clusterRadius * member.clusterRadius, 0);
        const maxRadius = members.reduce((max, member) => Math.max(max, member.clusterRadius), 0);
        const importance = members.reduce((sum, member) => sum + member.importance, 0) / Math.max(1, members.length);
        const subgroupRadii = this._buildOrganicSubgroupsFromMembers(members).map(subgroup => subgroup.radius);
        const packedSubgroupsRadius = this._estimatePackedIslandRadius(
          subgroupRadii,
          ORGANIC_SUBGROUP_MIN_RADIUS,
          ORGANIC_SUBGROUP_GAP
        );

        return {
          key,
          label: members[0]?.groupLabel ?? this._organicGroupLabel(key, members[0]?.node),
          members,
          radius: Math.max(
            ORGANIC_GROUP_MIN_RADIUS,
            packedSubgroupsRadius + maxRadius * 0.46 + ORGANIC_SUBGROUP_GAP * 0.6,
            Math.sqrt(area / Math.PI) * 1.08 + maxRadius * 0.72 + Math.sqrt(members.length) * 132
          ),
          importance
        };
      })
      .sort((a, b) => {
        const sizeDiff = b.members.length - a.members.length;
        if (sizeDiff !== 0) return sizeDiff;
        return b.importance - a.importance;
      });
  }

  private static _organicGroupLabel(key: string, sampleNode?: GenieTreeNode): string {
    if (key.startsWith('type:')) {
      const type = key.split(':')[1] ?? 'TYPE';
      return sampleNode?.label ? `${type.toUpperCase()} / ${sampleNode.label}` : type.toUpperCase();
    }
    if (key.startsWith('node-type:')) return key.slice('node-type:'.length).replace(/-/g, ' ').toUpperCase();
    if (key.startsWith('scope:')) return key.slice('scope:'.length).replace(/-/g, ' ').toUpperCase();
    if (sampleNode?.label) return sampleNode.label;
    return key.replace(/^(tree|type|subtree|node-type|scope):/, '').toUpperCase();
  }

  private static _normalizeGroupPart(value: string | number | null | undefined): string {
    return String(value ?? 'unknown')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.$-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'unknown';
  }

  private static _organicGroupCenters(
    centerX: number,
    centerY: number,
    groups: Array<{
      key: string;
      label: string;
      members: unknown[];
      radius: number;
      importance: number;
    }>
  ): Map<string, { center: { x: number; y: number }; radius: number; colorSeed: number }> {
    const centers = new Map<string, { center: { x: number; y: number }; radius: number; colorSeed: number }>();
    let groupIndex = 0;
    let ringIndex = 0;
    let ringRadius = ORGANIC_GROUP_SPACING + (groups[0]?.radius ?? ORGANIC_GROUP_MIN_RADIUS);

    while (groupIndex < groups.length) {
      const maxRadius = groups[groupIndex]?.radius ?? ORGANIC_GROUP_MIN_RADIUS;
      const slotSize = Math.max(ORGANIC_GROUP_MIN_RADIUS * 2.45, maxRadius * 2.05 + ORGANIC_GROUP_GAP);
      const ringCapacity = Math.max(3, Math.floor((Math.PI * 2 * ringRadius) / slotSize));
      const ringCount = Math.min(ringCapacity, groups.length - groupIndex);
      const angleOffset = (ringIndex % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / ringCount)
        + (this._stableHash(`ring:${ringIndex}`) % 360) * Math.PI / 1800;

      for (let ringSlot = 0; ringSlot < ringCount; ringSlot++) {
        const group = groups[groupIndex + ringSlot];
        const angle = angleOffset + ringSlot * (Math.PI * 2 / ringCount);
        const radialJitter = ((this._stableHash(group.key) % 1000) / 1000 - 0.5) * Math.min(ORGANIC_GROUP_MAX_RING_BOOST, group.radius * 0.12);
        const effectiveRadius = ringRadius + group.radius * 0.38 + group.importance * 360 + radialJitter;
        centers.set(group.key, {
          center: {
            x: centerX + Math.cos(angle) * effectiveRadius,
            y: centerY + Math.sin(angle) * effectiveRadius
          },
          radius: group.radius,
          colorSeed: this._stableHash(group.key)
        });
      }

      groupIndex += ringCount;
      ringRadius += Math.max(ORGANIC_GROUP_RING_GAP, maxRadius * 2.18 + ORGANIC_GROUP_GAP);
      ringIndex++;
    }

    return centers;
  }

  private static _placeOrganicGroupMembers(
    group: OrganicGroup,
    groupIndex: number,
    groupRegion: { center: { x: number; y: number }; radius: number; colorSeed: number },
    injectorPositions: Map<number, { x: number; y: number }>,
    injectorGroups: Map<number, OrganicGroupAssignment>
  ): void {
    const subgroups = this._buildOrganicSubgroups(group);
    const subgroupCenters = this._organicSubgroupCenters(groupRegion.center, groupRegion.radius, subgroups, groupIndex);

    subgroups.forEach((subgroup, subgroupIndex) => {
      const subgroupRegion = subgroupCenters.get(subgroup.key);
      if (!subgroupRegion) return;
      const branchAngle = Math.atan2(
        subgroupRegion.center.y - groupRegion.center.y,
        subgroupRegion.center.x - groupRegion.center.x
      );

      subgroup.members.forEach((entry, localIndex) => {
        const position = this._organicSubgroupInjectorPosition(
          subgroupRegion.center,
          branchAngle,
          localIndex,
          entry.node.id,
          entry.clusterRadius,
          entry.importance,
          subgroupRegion.radius,
          subgroup.members.length
        );
        const assignment: OrganicGroupAssignment = {
          key: group.key,
          label: group.label,
          index: groupIndex,
          memberCount: group.members.length,
          center: groupRegion.center,
          radius: groupRegion.radius,
          colorSeed: groupRegion.colorSeed,
          subgroupKey: subgroup.key,
          subgroupLabel: subgroup.label,
          subgroupIndex,
          subgroupMemberCount: subgroup.members.length,
          subgroupCenter: subgroupRegion.center,
          subgroupRadius: subgroupRegion.radius
        };
        injectorPositions.set(entry.node.id, position);
        injectorGroups.set(entry.node.id, assignment);
      });
    });
  }

  private static _buildOrganicSubgroups(group: OrganicGroup): OrganicSubgroup[] {
    return this._buildOrganicSubgroupsFromMembers(group.members);
  }

  private static _buildOrganicSubgroupsFromMembers(members: OrganicRankedNode[]): OrganicSubgroup[] {
    const subgroupsByKey = new Map<string, OrganicRankedNode[]>();

    for (const member of members) {
      const subgroup = subgroupsByKey.get(member.subgroupKey);
      if (subgroup) {
        subgroup.push(member);
      } else {
        subgroupsByKey.set(member.subgroupKey, [member]);
      }
    }

    return Array.from(subgroupsByKey.entries())
      .map(([key, members]) => {
        const importance = members.reduce((sum, member) => sum + member.importance, 0) / Math.max(1, members.length);
        return {
          key,
          label: members[0]?.subgroupLabel ?? this._organicGroupLabel(key, members[0]?.node),
          members,
          radius: this._estimateOrganicSubgroupRadius(members),
          importance
        };
      })
      .sort((a, b) => {
        const sizeDiff = b.members.length - a.members.length;
        if (sizeDiff !== 0) return sizeDiff;
        return b.importance - a.importance;
      });
  }

  private static _estimateOrganicSubgroupRadius(members: OrganicRankedNode[]): number {
    const area = members.reduce((sum, member) => sum + Math.PI * member.clusterRadius * member.clusterRadius, 0);
    const maxRadius = members.reduce((max, member) => Math.max(max, member.clusterRadius), 0);
    const injectorRows = Math.max(1, Math.ceil(Math.sqrt(members.length)));
    const branchAllowance = maxRadius * 0.82 + injectorRows * 180;

    return Math.max(
      ORGANIC_SUBGROUP_MIN_RADIUS,
      Math.sqrt(area / Math.PI) * 0.92 + maxRadius * 0.68 + Math.sqrt(members.length) * 118,
      branchAllowance
    );
  }

  private static _estimatePackedIslandRadius(
    radii: number[],
    minRadius: number,
    gap: number
  ): number {
    if (radii.length === 0) return minRadius;

    const sortedRadii = [...radii].sort((a, b) => b - a);
    let index = 0;
    let ringRadius = sortedRadii[0] + gap;
    let outerRadius = minRadius;

    while (index < sortedRadii.length) {
      const maxRadius = sortedRadii[index];
      const slotSize = Math.max(minRadius * 1.4, maxRadius * 2 + gap);
      const ringCapacity = Math.max(1, Math.floor((Math.PI * 2 * ringRadius) / slotSize));
      const ringCount = Math.min(ringCapacity, sortedRadii.length - index);

      for (let slot = 0; slot < ringCount; slot++) {
        outerRadius = Math.max(outerRadius, ringRadius + sortedRadii[index + slot]);
      }

      index += ringCount;
      ringRadius += Math.max(gap, maxRadius * 2 + gap);
    }

    return outerRadius + gap * 0.35;
  }

  private static _buildOrganicServiceEntries(
    rankedNodes: OrganicRankedNode[],
    servicesByNodeId: Map<number, GenieServiceRegistration[]>,
    groupingStrategy: Exclude<ConstellationGroupingStrategy, 'auto'>,
    usedProviderIds: Set<number>
  ): OrganicServiceRankedNode[] {
    const entries: OrganicServiceRankedNode[] = [];
    const seenServiceIds = new Set<number>();

    for (const owner of rankedNodes) {
      const services = servicesByNodeId.get(owner.node.id) ?? [];
      for (const service of services) {
        if (seenServiceIds.has(service.id)) continue;
        seenServiceIds.add(service.id);

        const depType = service.dependencyType || 'Service';
        const isRootScope = service.isRoot || service.token?.['ɵprov']?.providedIn === 'root';
        const isUnused = !usedProviderIds.has(service.id);
        const importance = this._serviceImportance(
          service,
          depType,
          service.usageCount || 0,
          isRootScope,
          isUnused,
          service.isFramework
        );
        const scope = this._serviceScopeGroup(service, isRootScope, isUnused);
        const groupKey = groupingStrategy === 'scope'
          ? `scope:${scope.key}`
          : `node-type:${this._normalizeGroupPart(depType)}`;
        const groupLabel = groupingStrategy === 'scope'
          ? scope.label
          : depType;
        const subgroupKey = groupingStrategy === 'scope'
          ? `${groupKey}:${this._normalizeGroupPart(depType)}:${this._normalizeGroupPart(service.label)}`
          : `${groupKey}:${this._normalizeGroupPart(service.label)}`;
        const subgroupLabel = groupingStrategy === 'scope'
          ? `${depType} / ${service.label}`
          : service.label;

        entries.push({
          service,
          ownerNodeId: owner.node.id,
          originalIndex: entries.length,
          importance,
          clusterRadius: this._estimateOrganicServiceLeafRadius(importance),
          groupKey,
          groupLabel,
          subgroupKey,
          subgroupLabel
        });
      }
    }

    return entries.sort((a, b) => {
      const groupDiff = a.groupLabel.localeCompare(b.groupLabel);
      if (groupDiff !== 0) return groupDiff;
      const subgroupDiff = a.subgroupLabel.localeCompare(b.subgroupLabel);
      if (subgroupDiff !== 0) return subgroupDiff;
      return b.importance - a.importance || a.originalIndex - b.originalIndex;
    });
  }

  private static _buildOrganicServiceGroups(entries: OrganicServiceRankedNode[]): OrganicServiceGroup[] {
    const groupsByKey = new Map<string, OrganicServiceRankedNode[]>();

    for (const entry of entries) {
      const group = groupsByKey.get(entry.groupKey);
      if (group) {
        group.push(entry);
      } else {
        groupsByKey.set(entry.groupKey, [entry]);
      }
    }

    return Array.from(groupsByKey.entries())
      .map(([key, members]) => {
        const subgroups = this._buildOrganicServiceSubgroupsFromMembers(members);
        const subgroupRadii = subgroups.map(subgroup => subgroup.radius);
        const importance = members.reduce((sum, member) => sum + member.importance, 0) / Math.max(1, members.length);
        const maxRadius = subgroupRadii.reduce((max, radius) => Math.max(max, radius), ORGANIC_SUBGROUP_MIN_RADIUS);

        return {
          key,
          label: members[0]?.groupLabel ?? this._organicGroupLabel(key),
          members,
          radius: Math.max(
            ORGANIC_GROUP_MIN_RADIUS,
            this._estimatePackedIslandRadius(subgroupRadii, ORGANIC_SUBGROUP_MIN_RADIUS, ORGANIC_SUBGROUP_GAP) + maxRadius * 0.42
          ),
          importance
        };
      })
      .sort((a, b) => {
        const sizeDiff = b.members.length - a.members.length;
        if (sizeDiff !== 0) return sizeDiff;
        return b.importance - a.importance;
      });
  }

  private static _placeOrganicServiceGroupMembers(
    group: OrganicServiceGroup,
    groupIndex: number,
    groupRegion: { center: { x: number; y: number }; radius: number; colorSeed: number },
    servicePositions: Map<number, { x: number; y: number }>,
    serviceGroups: Map<number, OrganicGroupAssignment>
  ): void {
    const subgroups = this._buildOrganicServiceSubgroupsFromMembers(group.members);
    const subgroupCenters = this._organicSubgroupCenters(groupRegion.center, groupRegion.radius, subgroups, groupIndex);

    subgroups.forEach((subgroup, subgroupIndex) => {
      const subgroupRegion = subgroupCenters.get(subgroup.key);
      if (!subgroupRegion) return;

      subgroup.members.forEach((entry, localIndex) => {
        const position = this._organicServiceCloudPosition(
          subgroupRegion.center,
          localIndex,
          entry.service.id,
          subgroup.members.length,
          subgroupRegion.radius
        );
        const assignment: OrganicGroupAssignment = {
          key: group.key,
          label: group.label,
          index: groupIndex,
          memberCount: group.members.length,
          center: groupRegion.center,
          radius: groupRegion.radius,
          colorSeed: groupRegion.colorSeed,
          subgroupKey: subgroup.key,
          subgroupLabel: subgroup.label,
          subgroupIndex,
          subgroupMemberCount: subgroup.members.length,
          subgroupCenter: subgroupRegion.center,
          subgroupRadius: subgroupRegion.radius
        };
        servicePositions.set(entry.service.id, position);
        serviceGroups.set(entry.service.id, assignment);
      });
    });
  }

  private static _buildOrganicServiceSubgroupsFromMembers(
    members: OrganicServiceRankedNode[]
  ): OrganicServiceSubgroup[] {
    const subgroupsByKey = new Map<string, OrganicServiceRankedNode[]>();

    for (const member of members) {
      const subgroup = subgroupsByKey.get(member.subgroupKey);
      if (subgroup) {
        subgroup.push(member);
      } else {
        subgroupsByKey.set(member.subgroupKey, [member]);
      }
    }

    return Array.from(subgroupsByKey.entries())
      .map(([key, members]) => {
        const importance = members.reduce((sum, member) => sum + member.importance, 0) / Math.max(1, members.length);
        return {
          key,
          label: members[0]?.subgroupLabel ?? key,
          members,
          radius: this._estimateOrganicServiceSubgroupRadius(members),
          importance
        };
      })
      .sort((a, b) => {
        const sizeDiff = b.members.length - a.members.length;
        if (sizeDiff !== 0) return sizeDiff;
        return b.importance - a.importance;
      });
  }

  private static _estimateOrganicServiceSubgroupRadius(members: OrganicServiceRankedNode[]): number {
    const count = Math.max(1, members.length);
    const leafRadius = members.reduce((max, member) => Math.max(max, member.clusterRadius), 0);
    const cloudRadius = this._estimateCircularCloudRadius(count, 142 + Math.min(42, leafRadius * 0.18), 180);

    return Math.max(
      ORGANIC_SUBGROUP_MIN_RADIUS * 0.78,
      cloudRadius + leafRadius + Math.sqrt(count) * 26
    );
  }

  private static _estimateCircularCloudRadius(count: number, spacing: number, firstRingRadius: number): number {
    if (count <= 1) return firstRingRadius * 0.55;

    let placed = 1;
    let radius = firstRingRadius;
    while (placed < count) {
      const capacity = Math.max(6, Math.floor((Math.PI * 2 * radius) / spacing));
      placed += capacity;
      if (placed < count) radius += spacing * 0.86;
    }

    return radius + spacing * 0.55;
  }

  private static _organicServiceCloudPosition(
    center: { x: number; y: number },
    index: number,
    serviceId: number,
    count: number,
    subgroupRadius: number
  ): { x: number; y: number } {
    const hash = this._stableHash(String(serviceId));
    if (count <= 1 || index === 0) {
      const offset = count <= 1 ? 0 : 36 + (hash % 28);
      const angle = (hash % 6283) / 1000;
      return {
        x: center.x + Math.cos(angle) * offset,
        y: center.y + Math.sin(angle) * offset
      };
    }

    let remaining = index - 1;
    let ringRadius = 180;
    let ringIndex = 0;
    const spacing = 142;

    while (true) {
      const capacity = Math.max(6, Math.floor((Math.PI * 2 * ringRadius) / spacing));
      if (remaining < capacity) {
        const angleOffset = ((hash >>> 8) % 6283) / 1000 + ringIndex * 0.23;
        const angle = angleOffset + remaining * (Math.PI * 2 / capacity);
        const radius = Math.min(subgroupRadius * 0.86, ringRadius + (hash % 24));
        return {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius
        };
      }

      remaining -= capacity;
      ringRadius += spacing * 0.86;
      ringIndex++;
    }
  }

  private static _estimateOrganicServiceLeafRadius(importance: number): number {
    return 82 + importance * 92;
  }

  private static _serviceScopeGroup(
    service: GenieServiceRegistration,
    isRootScope: boolean,
    isUnused: boolean
  ): { key: string; label: string } {
    if (isRootScope) return {key: 'root-singleton', label: 'Root Singleton'};
    if (isUnused) return {key: 'unused', label: 'Unused'};
    if (service.isFramework) return {key: 'framework', label: 'Framework'};
    return {key: 'user-code-active', label: 'User Code'};
  }

  private static _organicSubgroupCenters(
    groupCenter: { x: number; y: number },
    groupRadius: number,
    subgroups: Array<{ key: string; radius: number }>,
    groupIndex: number
  ): Map<string, { center: { x: number; y: number }; radius: number }> {
    const centers = new Map<string, { center: { x: number; y: number }; radius: number }>();
    if (subgroups.length === 0) return centers;

    if (subgroups.length === 1) {
      const subgroup = subgroups[0];
      centers.set(subgroup.key, {
        center: groupCenter,
        radius: Math.min(groupRadius * 0.72, Math.max(subgroup.radius, ORGANIC_SUBGROUP_MIN_RADIUS))
      });
      return centers;
    }

    let subgroupIndex = 0;
    let ringIndex = 0;
    let ringRadius = subgroups[0].radius + ORGANIC_SUBGROUP_GAP;

    while (subgroupIndex < subgroups.length) {
      const maxRadius = subgroups[subgroupIndex].radius;
      const slotSize = Math.max(ORGANIC_SUBGROUP_MIN_RADIUS * 1.65, maxRadius * 2 + ORGANIC_SUBGROUP_GAP);
      const ringCapacity = Math.max(3, Math.floor((Math.PI * 2 * ringRadius) / slotSize));
      const ringCount = Math.min(ringCapacity, subgroups.length - subgroupIndex);
      const angleOffset = -Math.PI / 2
        + groupIndex * 0.37
        + (ringIndex % 2 === 0 ? 0 : Math.PI / ringCount);

      for (let ringSlot = 0; ringSlot < ringCount; ringSlot++) {
        const subgroup = subgroups[subgroupIndex + ringSlot];
        const angle = angleOffset + ringSlot * (Math.PI * 2 / ringCount);
        const radialNudge = ((this._stableHash(subgroup.key) % 1000) / 1000 - 0.5) * Math.min(260, subgroup.radius * 0.08);
        const radius = Math.min(
          Math.max(ringRadius + radialNudge, subgroup.radius + ORGANIC_SUBGROUP_GAP * 0.45),
          Math.max(ringRadius, groupRadius - subgroup.radius - ORGANIC_SUBGROUP_GAP * 0.45)
        );

        centers.set(subgroup.key, {
          center: {
            x: groupCenter.x + Math.cos(angle) * radius,
            y: groupCenter.y + Math.sin(angle) * radius
          },
          radius: Math.max(subgroup.radius, ORGANIC_SUBGROUP_MIN_RADIUS)
        });
      }

      subgroupIndex += ringCount;
      ringRadius += Math.max(ORGANIC_SUBGROUP_GAP, maxRadius * 2 + ORGANIC_SUBGROUP_GAP);
      ringIndex++;
    }

    return centers;
  }

  private static _organicSubgroupInjectorPosition(
    subgroupCenter: { x: number; y: number },
    branchAngle: number,
    localIndex: number,
    nodeId: number,
    clusterRadius: number,
    importance: number,
    subgroupRadius: number,
    subgroupMemberCount: number
  ): { x: number; y: number } {
    if (localIndex === 0) {
      const hash = this._stableHash(String(nodeId));
      return {
        x: subgroupCenter.x + Math.cos(branchAngle + Math.PI / 2) * ((hash % 90) - 45),
        y: subgroupCenter.y + Math.sin(branchAngle + Math.PI / 2) * ((hash % 90) - 45)
      };
    }

    const hash = this._stableHash(String(nodeId));
    const columns = Math.max(3, Math.min(10, Math.ceil(Math.sqrt(subgroupMemberCount) * 1.22)));
    const normalizedIndex = localIndex - 1;
    const row = Math.floor(normalizedIndex / columns);
    const col = normalizedIndex % columns;
    const side = (col - (columns - 1) / 2) * (172 + Math.min(90, clusterRadius * 0.10));
    const along = Math.min(
      subgroupRadius * 0.86,
      300 + row * (216 + Math.min(96, clusterRadius * 0.10)) + importance * 92 + (hash % 48)
    );
    const angle = branchAngle + ((hash % 200) - 100) / 2600;

    return {
      x: subgroupCenter.x + Math.cos(angle) * along + Math.cos(angle + Math.PI / 2) * side,
      y: subgroupCenter.y + Math.sin(angle) * along + Math.sin(angle + Math.PI / 2) * side
    };
  }

  private static _organicGroupedInjectorPosition(
    groupCenter: { x: number; y: number },
    localIndex: number,
    nodeId: number,
    clusterRadius: number,
    importance: number,
    groupRadius: number,
    groupIndex: number,
    groupMemberCount: number
  ): { x: number; y: number } {
    if (localIndex === 0) {
      const hash = this._stableHash(String(nodeId));
      return {
        x: groupCenter.x + Math.sin(hash * 0.001) * Math.min(90, groupRadius * 0.06),
        y: groupCenter.y + Math.cos(hash * 0.001) * Math.min(72, groupRadius * 0.05)
      };
    }

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const hash = this._stableHash(String(nodeId));
    const shape = groupIndex % 4;
    const normalizedIndex = localIndex - 1;
    const layer = Math.floor(Math.sqrt(normalizedIndex));
    const layerIndex = normalizedIndex - layer * layer;
    const layerCapacity = Math.max(1, layer * 2 + 1);
    const layerProgress = layerCapacity <= 1 ? 0 : layerIndex / (layerCapacity - 1);
    const spreadRadius = Math.min(groupRadius * 0.70, 210 + Math.sqrt(localIndex) * (112 + Math.min(110, clusterRadius * 0.16)));
    const sectorCenter = (hash % 6283) / 1000;
    let angle = localIndex * goldenAngle + (hash % 1000) / 1000 * 0.36;
    let radius = spreadRadius + clusterRadius * 0.12 + importance * 52;
    let yScale = 0.86;

    if (shape === 1) {
      angle = sectorCenter + (layerProgress - 0.5) * Math.PI * 1.24 + layer * 0.18;
      radius = Math.min(groupRadius * 0.74, 190 + layer * 126 + clusterRadius * 0.12);
      yScale = 0.94;
    } else if (shape === 2) {
      const shellCapacity = Math.max(6, Math.floor((Math.PI * 2 * (160 + layer * 120)) / 130));
      angle = -Math.PI / 2 + (layerIndex % shellCapacity) * (Math.PI * 2 / shellCapacity) + groupIndex * 0.21;
      radius = Math.min(groupRadius * 0.72, 170 + layer * 132 + clusterRadius * 0.10);
      yScale = 1;
    } else if (shape === 3) {
      const columns = Math.max(3, Math.ceil(Math.sqrt(groupMemberCount) * 0.68));
      const col = normalizedIndex % columns;
      const row = Math.floor(normalizedIndex / columns);
      const x = (col - (columns - 1) / 2) * (145 + Math.min(54, clusterRadius * 0.08));
      const y = (row - Math.sqrt(groupMemberCount) * 0.28) * (118 + Math.min(46, clusterRadius * 0.07));
      const rotation = (groupIndex % 2 === 0 ? -0.38 : 0.38) + (hash % 100) / 1000;
      return {
        x: groupCenter.x + x * Math.cos(rotation) - y * Math.sin(rotation),
        y: groupCenter.y + x * Math.sin(rotation) + y * Math.cos(rotation)
      };
    }

    return {
      x: groupCenter.x + Math.cos(angle) * radius,
      y: groupCenter.y + Math.sin(angle) * radius * yScale
    };
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
    serviceCount: number,
    branchAngle?: number
  ): { x: number; y: number } {
    if (branchAngle !== undefined) {
      const hash = this._stableHash(String(serviceId));
      const columns = Math.max(3, Math.min(18, Math.ceil(Math.sqrt(serviceCount) * 1.45)));
      const row = Math.floor(index / columns);
      const col = index % columns;
      const side = (col - (columns - 1) / 2) * ORGANIC_SERVICE_BRANCH_GAP;
      const along = ORGANIC_SERVICE_BRANCH_BASE
        + row * ORGANIC_SERVICE_BRANCH_ROW_GAP
        + Math.min(120, Math.log2(serviceCount + 1) * 12)
        + (hash % 46);
      const angle = branchAngle + ((hash % 200) - 100) / 3200;

      return {
        x: parent.x + Math.cos(angle) * along + Math.cos(angle + Math.PI / 2) * side,
        y: parent.y + Math.sin(angle) * along + Math.sin(angle + Math.PI / 2) * side
      };
    }

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

  private static _organicServiceBranchAngle(
    parent: { x: number; y: number },
    groupAssignment: OrganicGroupAssignment | undefined,
    nodeId: number
  ): number | undefined {
    if (!groupAssignment) return undefined;

    const origin = groupAssignment.subgroupCenter ?? groupAssignment.center;
    let angle = Math.atan2(parent.y - origin.y, parent.x - origin.x);
    if (Math.hypot(parent.x - origin.x, parent.y - origin.y) < 24) {
      if (groupAssignment.subgroupCenter) {
        angle = Math.atan2(
          groupAssignment.subgroupCenter.y - groupAssignment.center.y,
          groupAssignment.subgroupCenter.x - groupAssignment.center.x
        );
      } else {
        angle = (this._stableHash(String(nodeId)) % 6283) / 1000;
      }
    }

    return angle;
  }

  private static _estimateOrganicClusterRadius(serviceCount: number, importance: number): number {
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
