import {GenieServiceRegistration, GenieTreeNode} from '../../../../../models/genie-node.model';
import {GenieRegistryService} from '../../../../../services/genie-registry.service';
import {CONSTELLATION_THEME, RenderLink, RenderNode} from './constellation.models';
import {WorkerLink, WorkerNode} from './constellation.worker';
import {GenieFilterState} from '../../../options-panel/options-panel.models';

export interface MappedGraphData {
  workerNodes: WorkerNode[];
  workerLinks: WorkerLink[];
  renderNodes: Map<string, RenderNode>;
  renderLinks: RenderLink[];
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
    currentPositions: Map<string, { x: number, y: number }>
  ): MappedGraphData {

    const filteredTree = this._applyDeepSearch(tree, filterState);
    const visibleTreeNodes = this._flattenTree(filteredTree);

    const processedIds = new Set<string>();
    const visibleNodeIds = new Set<number>();
    const visibleServiceIds = new Set<number>();

    const workerNodes: WorkerNode[] = [];
    const workerLinks: WorkerLink[] = [];
    const nextRenderNodes = new Map<string, RenderNode>();

    const centerX = width / 2;
    const centerY = height / 2;
    const randomPos = (base: number) => base + (Math.random() - 0.5) * 150;
    const rootComponentId = visibleTreeNodes.length > 0 ? visibleTreeNodes[0].id : -1;

    visibleTreeNodes.forEach(node => {
      visibleNodeIds.add(node.id);
      const id = 'inj-' + node.id;

      if (processedIds.has(id)) return;
      processedIds.add(id);

      const existing = currentPositions.get(id);
      const isRootComponent = node.id === rootComponentId;

      const renderNode: RenderNode = {
        id,
        x: existing ? existing.x : randomPos(centerX),
        y: existing ? existing.y : randomPos(centerY),
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
          isFramework: false
        }
      };
      nextRenderNodes.set(id, renderNode);

      workerNodes.push({
        id,
        x: renderNode.x,
        y: renderNode.y,
        vx: 0, vy: 0,
        mass: isRootComponent ? 35 : 20,
        fixed: false,
        type: 'injector'
      });
    });


    if (showComponentTree) {
      const addHierarchyLinks = (nodes: GenieTreeNode[]) => {
        for (const node of nodes) {
          if (node.children) {
            for (const child of node.children) {
              if (visibleNodeIds.has(node.id) && visibleNodeIds.has(child.id)) {
                workerLinks.push({
                  sourceId: 'inj-' + node.id,
                  targetId: 'inj-' + child.id,
                  type: 'component-child'
                });
              }
            }
            addHierarchyLinks(node.children);
          }
        }
      };
      addHierarchyLinks(filteredTree);
    }

    const allDeps = registry.dependencies();
    const usedProviderIds = new Set<number>();

    allDeps.forEach(dep => {
      if (dep.providerId && visibleNodeIds.has(dep.consumerNodeId)) {
        usedProviderIds.add(dep.providerId);
      }
    });

    visibleTreeNodes.forEach(node => {
      let services = getServicesForNode(node);
      const parentId = 'inj-' + node.id;

      if (filterState) {
        services = services.filter(s => {
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

      services.forEach(svc => {
        visibleServiceIds.add(svc.id);
        const id = 'svc-' + svc.id;

        if (processedIds.has(id)) {
          workerLinks.push({sourceId: parentId, targetId: id, type: 'provider'});
          return;
        }
        processedIds.add(id);

        const existing = currentPositions.get(id);
        const depType = svc.dependencyType || 'Service';
        const isRootScope = svc.isRoot || svc.token?.['ɵprov']?.providedIn === 'root';
        const isUnused = !usedProviderIds.has(svc.id);
        const isFramework = svc.isFramework;

        const themeColor = this._getThemeColor(depType);
        let color = themeColor.color;
        let glow = themeColor.glow;

        if (isRootScope && depType === 'Service') {
          color = CONSTELLATION_THEME.root.color;
          glow = CONSTELLATION_THEME.root.glow;
        }

        const renderNode: RenderNode = {
          id,
          x: existing ? existing.x : randomPos(centerX),
          y: existing ? existing.y : randomPos(centerY),
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
            isFramework: isFramework
          }
        };
        nextRenderNodes.set(id, renderNode);

        workerNodes.push({
          id,
          x: renderNode.x,
          y: renderNode.y,
          vx: 0, vy: 0,
          mass: 5,
          fixed: false,
          type: 'service'
        });

        workerLinks.push({sourceId: parentId, targetId: id, type: 'provider'});
      });
    });

    const renderLinks: RenderLink[] = [];
    workerLinks.forEach(l => {
      renderLinks.push({
        ...l,
        uniqueId: l.sourceId + '_' + l.targetId
      });
    });

    allDeps.forEach(dep => {
      if (visibleNodeIds.has(dep.consumerNodeId) && dep.providerId && visibleServiceIds.has(dep.providerId)) {
        const sourceId = 'inj-' + dep.consumerNodeId;
        const targetId = 'svc-' + dep.providerId;
        renderLinks.push({
          sourceId, targetId, type: 'dependency',
          uniqueId: sourceId + '_' + targetId
        });
        workerLinks.push({sourceId, targetId, type: 'dependency'});
      }
    });

    return {workerNodes, workerLinks, renderNodes: nextRenderNodes, renderLinks};
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
    let result: GenieTreeNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (node.children && node.children.length > 0) {
        result = result.concat(this._flattenTree(node.children));
      }
    }
    return result;
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
