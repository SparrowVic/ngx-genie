export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface InstallCommand {
  readonly manager: PackageManager;
  readonly label: string;
  readonly command: string;
  readonly icon: string;
}

export interface SetupStep {
  readonly index: number;
  readonly title: string;
  readonly description: string;
  readonly code?: string;
  readonly lang?: string;
}
