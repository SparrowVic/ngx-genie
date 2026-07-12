import {GenieServiceRegistration, GenieTreeNode} from '../../../../../../models/genie-node.model';
import {ConstellationGroupingStrategy} from '../models/constellation.models';
import {MapperMetrics} from './mapper-metrics';
import {ConstellationGrouping} from './constellation-grouping';
import {
  ORGANIC_FIRST_SERVICE_RADIUS,
  ORGANIC_GROUP_GAP,
  ORGANIC_GROUP_MAX_RING_BOOST,
  ORGANIC_GROUP_MIN_RADIUS,
  ORGANIC_GROUP_RING_GAP,
  ORGANIC_GROUP_SPACING,
  ORGANIC_INJECTOR_SPACING,
  ORGANIC_MAX_CLUSTER_SPACING_BOOST,
  ORGANIC_SERVICE_BRANCH_BASE,
  ORGANIC_SERVICE_BRANCH_GAP,
  ORGANIC_SERVICE_BRANCH_ROW_GAP,
  ORGANIC_SERVICE_SPACING,
  ORGANIC_SUBGROUP_GAP,
  ORGANIC_SUBGROUP_MIN_RADIUS,
  ORGANIC_TARGET_EXTENT_MIN,
  ORGANIC_TARGET_EXTENT_PER_NODE,
} from './mapper.constants';
import {
  OrganicGroup,
  OrganicGroupAssignment,
  OrganicRankedNode,
  OrganicServiceGroup,
  OrganicServiceRankedNode,
  OrganicServiceSubgroup,
  OrganicSubgroup,
  StaticLayoutResult,
} from './mapper.models';

/**
 * Builds the clustered "organic" layout: ranks nodes/services by importance, buckets them into
 * groups/subgroups, packs group and subgroup regions, positions members, and normalizes the overall
 * extent so the graph frames cleanly. Pure and side-effect free.
 */
export class OrganicLayout {
  static _createOrganicLayout(
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
        const importance = MapperMetrics._injectorImportance(
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
          clusterRadius: MapperMetrics._estimateOrganicClusterRadius(services.length, importance),
          groupKey: ConstellationGrouping._organicGroupingKey(node, rootNodeId, nodeById, groupingStrategy),
          groupLabel: ConstellationGrouping._organicGroupingLabel(node, rootNodeId, nodeById, groupingStrategy),
          subgroupKey: ConstellationGrouping._organicSubgroupingKey(node, rootNodeId, nodeById, groupingStrategy),
          subgroupLabel: ConstellationGrouping._organicSubgroupingLabel(node, rootNodeId, nodeById, groupingStrategy)
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
          colorSeed: MapperMetrics._stableHash('root')
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

    this._normalizeOrganicExtent(
      centerX,
      centerY,
      injectorPositions,
      servicePositions,
      injectorGroups,
      serviceGroups
    );

    return {injectorPositions, servicePositions, injectorGroups, serviceGroups};
  }

  /**
   * The organic group placement is tuned for graphs of thousands of nodes and spreads groups tens of
   * thousands of pixels apart, which for a normal app produces a canvas so large it can't be framed.
   * Scale the whole clustered layout (positions AND group/subgroup region metadata) uniformly around
   * the centre so its extent fits a size proportional to node count — compact enough to see the whole
   * structure, roomy enough that nodes don't collide. Only ever shrinks (never inflates a small graph).
   */
  static _normalizeOrganicExtent(
    centerX: number,
    centerY: number,
    injectorPositions: Map<number, { x: number; y: number }>,
    servicePositions: Map<number, { x: number; y: number }>,
    injectorGroups: Map<number, OrganicGroupAssignment>,
    serviceGroups: Map<number, OrganicGroupAssignment>
  ): void {
    let maxExtent = 0;
    const track = (p: { x: number; y: number }) => {
      maxExtent = Math.max(maxExtent, Math.abs(p.x - centerX), Math.abs(p.y - centerY));
    };
    for (const p of injectorPositions.values()) track(p);
    for (const p of servicePositions.values()) track(p);
    if (maxExtent <= 0) return;

    const nodeCount = injectorPositions.size + servicePositions.size;
    const targetExtent = Math.max(
      ORGANIC_TARGET_EXTENT_MIN,
      Math.sqrt(nodeCount) * ORGANIC_TARGET_EXTENT_PER_NODE
    );
    const scale = Math.min(1, targetExtent / maxExtent);
    if (scale >= 0.999) return;

    const scalePoint = (p: { x: number; y: number }) => {
      p.x = centerX + (p.x - centerX) * scale;
      p.y = centerY + (p.y - centerY) * scale;
    };
    for (const p of injectorPositions.values()) scalePoint(p);
    for (const p of servicePositions.values()) scalePoint(p);

    // Region centres are shared object references across a group's members — scale each unique object
    // exactly once; radii are per-assignment number copies, safe to scale individually.
    const scaledCenters = new Set<{ x: number; y: number }>();
    const scaleAssignment = (a: OrganicGroupAssignment) => {
      if (a.center && !scaledCenters.has(a.center)) {
        scaledCenters.add(a.center);
        scalePoint(a.center);
      }
      if (a.subgroupCenter && !scaledCenters.has(a.subgroupCenter)) {
        scaledCenters.add(a.subgroupCenter);
        scalePoint(a.subgroupCenter);
      }
      a.radius *= scale;
      if (a.subgroupRadius != null) a.subgroupRadius *= scale;
    };
    for (const a of injectorGroups.values()) scaleAssignment(a);
    for (const a of serviceGroups.values()) scaleAssignment(a);
  }

  static _buildOrganicGroups(
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
          label: members[0]?.groupLabel ?? ConstellationGrouping._organicGroupLabel(key, members[0]?.node),
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

  static _organicGroupCenters(
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
        + (MapperMetrics._stableHash(`ring:${ringIndex}`) % 360) * Math.PI / 1800;

      for (let ringSlot = 0; ringSlot < ringCount; ringSlot++) {
        const group = groups[groupIndex + ringSlot];
        const angle = angleOffset + ringSlot * (Math.PI * 2 / ringCount);
        const radialJitter = ((MapperMetrics._stableHash(group.key) % 1000) / 1000 - 0.5) * Math.min(ORGANIC_GROUP_MAX_RING_BOOST, group.radius * 0.12);
        const effectiveRadius = ringRadius + group.radius * 0.38 + group.importance * 360 + radialJitter;
        centers.set(group.key, {
          center: {
            x: centerX + Math.cos(angle) * effectiveRadius,
            y: centerY + Math.sin(angle) * effectiveRadius
          },
          radius: group.radius,
          colorSeed: MapperMetrics._stableHash(group.key)
        });
      }

      groupIndex += ringCount;
      ringRadius += Math.max(ORGANIC_GROUP_RING_GAP, maxRadius * 2.18 + ORGANIC_GROUP_GAP);
      ringIndex++;
    }

    return centers;
  }

  static _placeOrganicGroupMembers(
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

  static _buildOrganicSubgroups(group: OrganicGroup): OrganicSubgroup[] {
    return this._buildOrganicSubgroupsFromMembers(group.members);
  }

  static _buildOrganicSubgroupsFromMembers(members: OrganicRankedNode[]): OrganicSubgroup[] {
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
          label: members[0]?.subgroupLabel ?? ConstellationGrouping._organicGroupLabel(key, members[0]?.node),
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

  static _estimateOrganicSubgroupRadius(members: OrganicRankedNode[]): number {
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

  static _estimatePackedIslandRadius(
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

  static _buildOrganicServiceEntries(
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
        const importance = MapperMetrics._serviceImportance(
          service,
          depType,
          service.usageCount || 0,
          isRootScope,
          isUnused,
          service.isFramework
        );
        const scope = ConstellationGrouping._serviceScopeGroup(service, isRootScope, isUnused);
        const groupKey = groupingStrategy === 'scope'
          ? `scope:${scope.key}`
          : `node-type:${ConstellationGrouping._normalizeGroupPart(depType)}`;
        const groupLabel = groupingStrategy === 'scope'
          ? scope.label
          : depType;
        const subgroupKey = groupingStrategy === 'scope'
          ? `${groupKey}:${ConstellationGrouping._normalizeGroupPart(depType)}:${ConstellationGrouping._normalizeGroupPart(service.label)}`
          : `${groupKey}:${ConstellationGrouping._normalizeGroupPart(service.label)}`;
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

  static _buildOrganicServiceGroups(entries: OrganicServiceRankedNode[]): OrganicServiceGroup[] {
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
          label: members[0]?.groupLabel ?? ConstellationGrouping._organicGroupLabel(key),
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

  static _placeOrganicServiceGroupMembers(
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

  static _buildOrganicServiceSubgroupsFromMembers(
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

  static _estimateOrganicServiceSubgroupRadius(members: OrganicServiceRankedNode[]): number {
    const count = Math.max(1, members.length);
    const leafRadius = members.reduce((max, member) => Math.max(max, member.clusterRadius), 0);
    const cloudRadius = this._estimateCircularCloudRadius(count, 142 + Math.min(42, leafRadius * 0.18), 180);

    return Math.max(
      ORGANIC_SUBGROUP_MIN_RADIUS * 0.78,
      cloudRadius + leafRadius + Math.sqrt(count) * 26
    );
  }

  static _estimateCircularCloudRadius(count: number, spacing: number, firstRingRadius: number): number {
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

  static _organicServiceCloudPosition(
    center: { x: number; y: number },
    index: number,
    serviceId: number,
    count: number,
    subgroupRadius: number
  ): { x: number; y: number } {
    const hash = MapperMetrics._stableHash(String(serviceId));
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

  static _estimateOrganicServiceLeafRadius(importance: number): number {
    return 82 + importance * 92;
  }

  static _organicSubgroupCenters(
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
        const radialNudge = ((MapperMetrics._stableHash(subgroup.key) % 1000) / 1000 - 0.5) * Math.min(260, subgroup.radius * 0.08);
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

  static _organicSubgroupInjectorPosition(
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
      const hash = MapperMetrics._stableHash(String(nodeId));
      return {
        x: subgroupCenter.x + Math.cos(branchAngle + Math.PI / 2) * ((hash % 90) - 45),
        y: subgroupCenter.y + Math.sin(branchAngle + Math.PI / 2) * ((hash % 90) - 45)
      };
    }

    const hash = MapperMetrics._stableHash(String(nodeId));
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

  static _organicGroupedInjectorPosition(
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
      const hash = MapperMetrics._stableHash(String(nodeId));
      return {
        x: groupCenter.x + Math.sin(hash * 0.001) * Math.min(90, groupRadius * 0.06),
        y: groupCenter.y + Math.cos(hash * 0.001) * Math.min(72, groupRadius * 0.05)
      };
    }

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const hash = MapperMetrics._stableHash(String(nodeId));
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

  static _organicInjectorPosition(
    centerX: number,
    centerY: number,
    index: number,
    nodeId: number,
    clusterRadius: number,
    importance: number
  ): { x: number; y: number } {
    if (index === 0) return {x: centerX, y: centerY};

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const hash = MapperMetrics._stableHash(String(nodeId));
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

  static _organicServicePosition(
    parent: { x: number; y: number },
    index: number,
    serviceId: number,
    serviceCount: number,
    branchAngle?: number
  ): { x: number; y: number } {
    if (branchAngle !== undefined) {
      const hash = MapperMetrics._stableHash(String(serviceId));
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
    const hash = MapperMetrics._stableHash(String(serviceId));
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

  static _organicServiceBranchAngle(
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
        angle = (MapperMetrics._stableHash(String(nodeId)) % 6283) / 1000;
      }
    }

    return angle;
  }

}
