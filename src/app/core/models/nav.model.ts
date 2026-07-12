export interface NavLink {
  readonly label: string;
  readonly path: string;
  readonly icon: string;
  readonly exact?: boolean;
  readonly badge?: string;
}
