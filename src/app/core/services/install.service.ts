import { Injectable, computed, inject, signal } from '@angular/core';
import { InstallCommand, PackageManager, SetupStep } from '../models/install.model';
import { HotkeyService } from './hotkey.service';

@Injectable({ providedIn: 'root' })
export class InstallService {
  private readonly hotkey = inject(HotkeyService);

  private readonly _commands = signal<InstallCommand[]>([
    { manager: 'npm', label: 'npm', command: 'npm install ngx-genie --save-dev', icon: 'npm' },
    { manager: 'pnpm', label: 'pnpm', command: 'pnpm add -D ngx-genie', icon: 'pnpm' },
    { manager: 'yarn', label: 'yarn', command: 'yarn add ngx-genie --dev', icon: 'yarn' },
    { manager: 'bun', label: 'bun', command: 'bun add -d ngx-genie', icon: 'bun' },
  ]);
  readonly commands = this._commands.asReadonly();

  private readonly _manager = signal<PackageManager>('npm');
  readonly manager = this._manager.asReadonly();

  readonly current = computed(
    () => this._commands().find((c) => c.manager === this._manager()) ?? this._commands()[0],
  );

  readonly steps = computed<SetupStep[]>(() => [
    {
      index: 1, title: 'Install the dev dependency', lang: 'bash',
      description: 'Add ngx-genie to your workspace — it ships zero runtime cost in production.',
      code: 'npm install ngx-genie --save-dev',
    },
    {
      index: 2, title: 'Provide GenieOS', lang: 'ts',
      description: 'Register the provider in your application config. Standalone, no NgModule required.',
      code: `import { provideGenie } from 'ngx-genie';\n\nexport const appConfig = {\n  providers: [\n    provideGenie({ hotkey: '${this.hotkey.key}', visibleOnStart: false }),\n  ],\n};`,
    },
    {
      index: 3, title: 'Summon the overlay', lang: 'bash',
      description: `Run your app and press ${this.hotkey.key} to open the observatory.`,
      code: `ng serve  →  press ${this.hotkey.key}`,
    },
  ]);

  select(manager: PackageManager): void {
    this._manager.set(manager);
  }
}
