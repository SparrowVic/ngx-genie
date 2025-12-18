export interface GenieFilterState {
  hideUnusedDeps: boolean;
  hideIsolatedComponents: boolean;
  minDeps: number;
  maxDeps: number;

  hideInternals: boolean;
  groupSimilarSiblings: boolean;

  showRootOnly: boolean;
  showLocalOnly: boolean;

  showUserServices: boolean;
  showUserPipes: boolean;
  showUserDirectives: boolean;
  showUserComponents: boolean;
  showUserTokens: boolean;
  showUserValues: boolean;
  showUserObservables: boolean;
  showUserSignals: boolean;

  showFrameworkServices: boolean;
  showFrameworkPipes: boolean;
  showFrameworkDirectives: boolean;
  showFrameworkComponents: boolean;
  showFrameworkTokens: boolean;
  showFrameworkSystem: boolean;
  showFrameworkObservables: boolean;
  showFrameworkSignals: boolean;

  componentTags: string[];
  dependencyTags: string[];
  searchMode: 'component' | 'dependency';
  matchMode: 'AND' | 'OR';
  searchTags: any[];
}

export type SearchMode = 'component' | 'dependency';
export type MatchMode = 'AND' | 'OR';
