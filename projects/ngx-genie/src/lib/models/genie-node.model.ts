import {Injector} from '@angular/core';

export type GenieNodeType =
  'Element'
  | 'Environment'
  | 'Root';

export interface GenieNode {
  id: number;
  label: string;
  injector: Injector;
  type: GenieNodeType;
  parentId: number | null;
  componentInstance?: any;
  isActive: boolean;
}

export interface GenieTreeNode extends GenieNode {
  children: GenieTreeNode[];
  groupCount?: number;
}

export type GenieProviderType =
  'Class'
  | 'Value'
  | 'Factory'
  | 'Existing'
  | 'Unknown';


export type GenieDependencyType =
  'Service'
  | 'Pipe'
  | 'Directive'
  | 'Component'
  | 'Token'
  | 'Value'
  | 'Observable'
  | 'Signal'
  | 'System';

export interface GenieServiceRegistration {
  id: number;
  nodeId: number;
  token: any;
  instance: any;
  label: string;
  providerType: GenieProviderType;
  usageCount: number;
  properties: Record<string, any>;
  isRoot?: boolean;
  isFramework: boolean;

  dependencyType: GenieDependencyType;
}


export type DependencyType = 'Direct' | 'Unknown';

export interface InjectionFlags {
  optional?: boolean;
  skipSelf?: boolean;
  self?: boolean;
  host?: boolean;
}

export interface GenieDependency {
  consumerNodeId: number;
  providerId: number | null;
  tokenName: string;
  propName?: string;
  type: DependencyType;
  flags: InjectionFlags;
  resolutionPath: number[];
}
