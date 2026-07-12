import {GenieDependency, GenieServiceRegistration, GenieTreeNode} from '../../../../../../models/genie-node.model';
import {
  CONSTELLATION_THEME,
  ConstellationGroupingStrategy,
  ConstellationGraphStats,
  ConstellationLayoutStrategy,
  RenderLink,
  RenderNode
} from '../models/constellation.models';
import {WorkerNode} from '../worker/constellation.worker';
import {GenieFilterState} from '../../../../options-panel/options-panel.models';
import {
  HUGE_GRAPH_NODE_THRESHOLD,
  HUGE_GRAPH_LINK_THRESHOLD,
  ATLAS_LAYOUT_NODE_THRESHOLD,
  ATLAS_LAYOUT_LINK_THRESHOLD,
  ATLAS_MAX_RENDERED_PROVIDER_LINKS,
  ATLAS_MAX_RENDERED_DEPENDENCY_LINKS,
  ATLAS_MAX_RENDERED_COMPONENT_LINKS,
  ATLAS_MAX_RENDERED_SERVICE_NODES,
} from './mapper.constants';
import {MappedGraphData, VisibleDependency} from './mapper.models';
import {MapperMetrics} from './mapper-metrics';
import {ConstellationGrouping} from './constellation-grouping';
import {GraphLinks} from './graph-links';
import {GraphSelection} from './graph-selection';
import {OrganicLayout} from './organic-layout';
import {AtlasLayout} from './atlas-layout';

export type {MappedGraphData} from './mapper.models';

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

    const filteredTree = GraphSelection._applyDeepSearch(tree, filterState);
    const visibleTreeNodes = GraphSelection._flattenTree(filteredTree);
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
      const services = GraphSelection._filterServicesForNode(getServicesForNode(node), filterState, usedProviderIds, forceShown);
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
    // An explicit grouping choice (node-type / scope / tree) always produces the clustered organic
    // layout, so grouping is visible on a graph of ANY size. 'auto' only clusters when the graph is
    // already big or tree-shaped (otherwise the default view stays the live force simulation), and
    // 'none' never clusters.
    const isExplicitGrouping = groupingStrategy === 'node-type'
      || groupingStrategy === 'type'
      || groupingStrategy === 'scope'
      || groupingStrategy === 'tree';
    const shouldUseGroupedOrganicLayout = layoutStrategy === 'auto'
      && (
        isExplicitGrouping
        || (groupingStrategy === 'auto' && (shouldUseStaticLayout || showComponentTree || estimatedNodeCount > 900))
      );
    const useOrganicLayout = layoutStrategy === 'organic' || shouldUseGroupedOrganicLayout;
    const useAtlasLayout = layoutStrategy === 'atlas'
      || (layoutStrategy === 'auto' && shouldUseStaticLayout && !useOrganicLayout);
    const useStaticLayout = useAtlasLayout || useOrganicLayout;
    const effectiveGroupingStrategy = ConstellationGrouping._resolveGroupingStrategy(groupingStrategy, useOrganicLayout);
    const renderServicesByNodeId = new Map<number, GenieServiceRegistration[]>();
    let remainingServiceRenderBudget = useStaticLayout ? ATLAS_MAX_RENDERED_SERVICE_NODES : Number.POSITIVE_INFINITY;
    for (const node of visibleTreeNodes) {
      const services = servicesByNodeId.get(node.id) ?? [];
      const renderServices = useStaticLayout
        ? GraphSelection._selectAtlasServicesForRender(services, remainingServiceRenderBudget)
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
          ? OrganicLayout._createOrganicLayout(
            visibleTreeNodes,
            renderServicesByNodeId,
            dependencyCountByNodeId,
            rootComponentId,
            centerX,
            centerY,
            effectiveGroupingStrategy,
            usedProviderIds
          )
          : AtlasLayout._createAtlasLayout(visibleTreeNodes, renderServicesByNodeId, centerX, centerY)
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
      const importance = MapperMetrics._injectorImportance(
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
              || MapperMetrics._stableHash(uniqueId) % 19 === 0;
            addRenderLink('inj-' + node.id, 'inj-' + child.id, 'component-child', shouldRender);
          }
          hierarchyStack.push(child);
        }
      }
    }

    if (useStaticLayout) {
      const aggregateSummary = GraphLinks._aggregateDependencySummary(
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
            || MapperMetrics._stableHash(uniqueId) % 23 === 0;
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
        const importance = MapperMetrics._serviceImportance(svc, depType, usageCount, isRootScope, isUnused, isFramework);

        const themeColor = MapperMetrics._getThemeColor(depType);
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
          || MapperMetrics._stableHash(uniqueId) % 23 === 0;
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
          && (seenDependencyLinks % dependencyRenderStride === 0 || MapperMetrics._stableHash(uniqueId) % dependencyRenderStride === 0)
        );
      addRenderLink(sourceId, targetId, 'dependency', shouldRender);
    }

    const workerLinks = useStaticLayout ? [] : GraphLinks._selectSimulationLinks(renderLinks, workerNodes.length);
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

}
