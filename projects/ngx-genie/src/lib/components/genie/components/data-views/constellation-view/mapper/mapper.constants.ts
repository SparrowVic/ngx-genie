/** Tuning constants shared across the constellation layout builders. */

export const HUGE_GRAPH_NODE_THRESHOLD = 3500;
export const HUGE_GRAPH_LINK_THRESHOLD = 12000;
export const ATLAS_LAYOUT_NODE_THRESHOLD = 1800;
export const ATLAS_LAYOUT_LINK_THRESHOLD = 7000;

export const SIM_PROVIDER_LINK_LIMIT = 9000;
export const SIM_COMPONENT_LINK_LIMIT = 9000;
export const SIM_DEPENDENCY_LINK_LIMIT = 2800;

export const ATLAS_MAX_RENDERED_PROVIDER_LINKS = 26000;
export const ATLAS_MAX_RENDERED_DEPENDENCY_LINKS = 16000;
export const ATLAS_MAX_RENDERED_COMPONENT_LINKS = 16000;
export const ATLAS_MAX_RENDERED_AGGREGATE_LINKS = 9000;
export const ATLAS_MAX_RENDERED_SERVICE_NODES = 24000;
export const ATLAS_MAX_SERVICES_PER_INJECTOR = 320;
export const ATLAS_MIN_CELL_SIZE = 420;
export const ATLAS_SERVICE_NODE_SPACING = 28;
export const ATLAS_RING_GAP = 38;
export const ATLAS_FIRST_RING_RADIUS = 76;

export const ORGANIC_INJECTOR_SPACING = 360;
export const ORGANIC_SERVICE_SPACING = 34;
export const ORGANIC_FIRST_SERVICE_RADIUS = 88;
export const ORGANIC_SERVICE_BRANCH_BASE = 700;
export const ORGANIC_SERVICE_BRANCH_GAP = 148;
export const ORGANIC_SERVICE_BRANCH_ROW_GAP = 300;
export const ORGANIC_MAX_CLUSTER_SPACING_BOOST = 620;
export const ORGANIC_GROUP_SPACING = 7600;
export const ORGANIC_GROUP_GAP = 4300;
export const ORGANIC_GROUP_RING_GAP = 5200;
export const ORGANIC_GROUP_MAX_RING_BOOST = 1500;
export const ORGANIC_GROUP_MIN_RADIUS = 2200;
export const ORGANIC_SUBGROUP_GAP = 1320;
export const ORGANIC_SUBGROUP_MIN_RADIUS = 840;
// Target on-screen extent for the compacted organic layout (see OrganicLayout.normalizeExtent). Tuned
// so a few-hundred-node graph frames cleanly while keeping intra-cluster nodes from colliding.
export const ORGANIC_TARGET_EXTENT_MIN = 3200;
export const ORGANIC_TARGET_EXTENT_PER_NODE = 520;
