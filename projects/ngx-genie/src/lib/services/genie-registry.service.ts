import {
  Injectable,
  Injector,
  computed,
  signal,
  InjectionToken,
  ApplicationRef,
  ComponentRef,
  Type,
  isSignal,
  ChangeDetectorRef,
  ViewRef,
} from '@angular/core';
import {
  GenieNode,
  GenieServiceRegistration,
  GenieProviderType,
  GenieNodeType,
  GenieDependency,
  InjectionFlags
} from '../models/genie-node.model';
import {ANGULAR_INTERNALS, ANGULAR_CORE_SYSTEM} from '../configs/angular-internals';

const ORIGINAL_INJECTOR_GET = Injector.prototype.get;

const IGNORED_TOKENS = new Set<any>([
  Injector,
  'GenieRegistryService',
  'GenieDiagnosticsService',
  'GenieExplorerStateService',
  'InspectorStateService',
  'GENIE_CONFIG',
  'GENIE_NODE'
]);

const GENIE_INTERNAL_COMPONENTS = new Set([
  '_GenieComponent'
]);

const CONTEXT_INDEX = 8;

export type GenieDependencyType =
  'Service'
  | 'Pipe'
  | 'Directive'
  | 'Component'
  | 'Token'
  | 'Value'
  | 'Observable'
  | 'System';

@Injectable()
export class GenieRegistryService {
  private readonly _isOpen = signal(false);
  readonly isOpen = computed(() => this._isOpen());

  private readonly _nodes = signal<GenieNode[]>([]);
  readonly nodes = computed(() => this._nodes());

  private readonly _services = signal<GenieServiceRegistration[]>([]);
  readonly services = computed(() => this._services());

  private readonly _dependencies = signal<GenieDependency[]>([]);
  readonly dependencies = computed(() => this._dependencies());

  private _nextNodeId = 1;
  private _nextServiceId = 1;
  private _hasWarnedAboutProduction = false;

  private injectorToNodeMap = new WeakMap<Injector, number>();
  private instanceToServiceMap = new WeakMap<any, number>();

  constructor(private appRef: ApplicationRef) {
    this.installSpy();
  }

  private installSpy(): void {
    const registry = this;

    Injector.prototype.get = function (token: any, notFoundValue?: any, flags?: any): any {

      const result = (ORIGINAL_INJECTOR_GET as any).apply(this, [token, notFoundValue, flags]);

      if (registry.isIgnoredToken(token)) return result;

      try {
        registry.handleInjectionEvent(this, token, result, flags);
      } catch (e) {
        console.warn('[Genie Spy Error]', e);
      }

      return result;
    };
  }

  handleInjectionEvent(requestingInjector: Injector, token: any, instance: any, flags: any) {
    const consumerId = this.injectorToNodeMap.get(requestingInjector);

    if (!consumerId) return;

    let providerId: number | null = null;

    if (instance && typeof instance === 'object') {
      providerId = this.instanceToServiceMap.get(instance) || null;
      if (!providerId) {
        providerId = this.registerLazySystemProvider(consumerId, token, instance);
      }
    }

    const flagsNum = typeof flags === 'number' ? flags : 0;

    const decodedFlags: InjectionFlags = {
      optional: (flagsNum & 8) !== 0,
      skipSelf: (flagsNum & 4) !== 0,
      self: (flagsNum & 2) !== 0,
      host: (flagsNum & 1) !== 0
    };

    const tokenName = this.describeToken(token);

    this.upsertDependency(consumerId, providerId, tokenName, decodedFlags, 'Direct');
  }

  private registerLazySystemProvider(nodeId: number, token: any, instance: any): number {
    const existingId = this.instanceToServiceMap.get(instance);
    if (existingId) return existingId;

    const id = this._nextServiceId++;

    const label = this.describeToken(token);
    const depType = this.getDependencyType(instance, token);
    const isFramework = this.isSystemToken(token);

    const reg: GenieServiceRegistration = {
      id,
      nodeId: nodeId,
      token,
      instance,
      label: label,

      dependencyType: depType,
      providerType: this.guessProviderType(token, instance),
      usageCount: 0,
      properties: {},
      isRoot: this.checkIsRoot(token),
      isFramework: isFramework
    };

    this.instanceToServiceMap.set(instance, id);
    this._services.update(existing => [...existing, reg]);
    return id;
  }

  scanApplication(): void {
    const rootComponents = this.appRef.components;
    rootComponents.forEach(rootRef => {
      this.scanComponentTree(rootRef, null);
    });
  }

  private scanComponentTree(compRef: ComponentRef<any>, parentNode: GenieNode | null): void {
    const componentType = compRef.componentType;
    const name = componentType.name || 'AnonymousComponent';

    if (this.isGenieInternalComponent(name)) return;

    const injector = compRef.injector;
    let node = this.findNodeByInjector(injector);

    if (!node) {
      node = this.register(name, injector, parentNode, 'Element');
      node.componentInstance = compRef.instance;
      this.injectorToNodeMap.set(injector, node.id);

      this.extractProvidersFromComponent(componentType, node);
      this.scanConstructorDependencies(componentType, node);
      this.scanInjectedProperties(node);
      this.scanTemplateDependencies(node);
    }

    const nativeElement = compRef.location.nativeElement as HTMLElement;
    this.scanDomForComponents(nativeElement, node);
  }

  private scanDomForComponents(element: HTMLElement, parentNode: GenieNode): void {
    // @ts-ignore
    const ng = window.ng;

    if (!ng || !ng.getComponent || !ng.getInjector) {
      if (!this._hasWarnedAboutProduction) {
        console.warn(
          '%c[Genie] ⚠️ Debugging utilities (window.ng) are missing.',
          'font-weight: bold; font-size: 1.1em; color: #f59e0b;',
          '\nGenie requires Angular DevTools support to scan the DOM tree.',
          '\nIf you are running a production build, this is expected behavior.'
        );
        this._hasWarnedAboutProduction = true;
      }
      return;
    }

    const children = Array.from(element.children);

    for (const child of children) {
      // @ts-ignore
      const context = ng.getComponent(child);

      if (context) {
        // @ts-ignore
        const childInjector = ng.getInjector(child);

        if (childInjector) {

          const componentType = context.constructor as Type<any>;
          const name = componentType.name || 'AnonymousComponent';

          if (this.isGenieInternalComponent(name)) continue;

          let node = this.findNodeByInjector(childInjector);
          if (!node) {
            node = this.register(name, childInjector, parentNode, 'Element');
            node.componentInstance = context;
            this.injectorToNodeMap.set(childInjector, node.id);

            this.extractProvidersFromComponent(componentType, node);
            this.scanConstructorDependencies(componentType, node);
            this.scanInjectedProperties(node);
            this.scanTemplateDependencies(node);
          }

          this.scanDomForComponents(child as HTMLElement, node);
          continue;
        }
      }
      this.scanDomForComponents(child as HTMLElement, parentNode);
    }
  }

  private scanInjectedProperties(node: GenieNode): void {
    if (!node.componentInstance) return;

    const instance = node.componentInstance;
    const keys = Object.keys(instance);

    for (const key of keys) {
      if (key.startsWith('__') || key.startsWith('ng') || key.startsWith('ɵ')) continue;

      try {
        const value = instance[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {

          const ctor = value.constructor;
          if (!ctor || ctor === Number || ctor === String || ctor === Boolean) continue;
          if (typeof Node !== 'undefined' && value instanceof Node) continue;

          if (this.isIgnoredToken(ctor)) continue;

          const token = ctor;
          const providerId = this.registerLazySystemProvider(node.id, token, value);
          const tokenName = this.describeToken(token);

          this.upsertDependency(node.id, providerId, tokenName, {}, 'Direct', key);
        }
      } catch (e) {
      }
    }
  }

  private scanTemplateDependencies(node: GenieNode): void {
    if (!node.componentInstance) return;

    let lView: any;

    try {
      const cdr = node.injector.get(ChangeDetectorRef, null);
      if (cdr && (cdr as any)._lView) {
        lView = (cdr as any)._lView;
      }
    } catch (e) {

    }

    if (!lView) return;

    const context = lView[CONTEXT_INDEX];
    if (context !== node.componentInstance) {
      return;
    }

    for (let i = 0; i < lView.length; i++) {
      const item = lView[i];

      if (item && typeof item === 'object') {

        const ctor = item.constructor;

        if (!ctor) continue;

        if (this.isGenieInternalComponent(ctor.name)) continue;

        if (ctor.ɵpipe) {
          this.registerTemplateDependency(node, item, 'Pipe');
        } else if (ctor.ɵcmp && item !== node.componentInstance) {
          this.registerTemplateDependency(node, item, 'Component');
        } else if (ctor.ɵdir && item !== node.componentInstance) {
          this.registerTemplateDependency(node, item, 'Directive');
        }
      }
    }
  }

  private registerTemplateDependency(node: GenieNode, instance: any, type: GenieDependencyType): void {
    const token = instance.constructor;
    const providerId = this.registerLazySystemProvider(node.id, token, instance);
    const tokenName = this.describeToken(token);

    this.upsertDependency(node.id, providerId, tokenName, {}, 'Direct');
  }

  private scanConstructorDependencies(componentType: Type<any>, node: GenieNode): void {
    let paramTypes: any[] = [];

    // @ts-ignore
    if (typeof Reflect !== 'undefined' && Reflect.getMetadata) {
      try {
        // @ts-ignore
        paramTypes = Reflect.getMetadata('design:paramtypes', componentType) || [];
      } catch (e) {
      }
    }

    if (paramTypes.length === 0 && (componentType as any).ctorParameters) {
      const ctorParams = (componentType as any).ctorParameters;
      const params = typeof ctorParams === 'function' ? ctorParams() : ctorParams;
      if (Array.isArray(params)) {
        paramTypes = params.map((p: any) => p.type || p);
      }
    }

    if (paramTypes && Array.isArray(paramTypes)) {
      paramTypes.forEach((type: any) => {
        if (!type) return;
        if (this.isIgnoredToken(type)) return;

        try {
          const instance = node.injector.get(type, null);
          if (instance) {
            const providerId = this.registerLazySystemProvider(node.id, type, instance);
            const tokenName = this.describeToken(type);
            this.upsertDependency(node.id, providerId, tokenName, {}, 'Direct');
          }
        } catch (e) {
        }
      });
    }
  }

  private upsertDependency(consumerId: number, providerId: number | null, tokenName: string, flags: InjectionFlags, type: any, propName?: string) {
    this._dependencies.update(deps => {
      const exists = deps.some(d =>
        d.consumerNodeId === consumerId &&
        d.tokenName === tokenName &&
        d.providerId === providerId
      );

      if (exists) return deps;

      if (providerId) {
        const svc = this._services().find(s => s.id === providerId);
        if (svc) this.incrementServiceUsage(providerId, svc.token);
      }

      return [...deps, {
        consumerNodeId: consumerId,
        providerId: providerId,
        tokenName: tokenName,
        type: type,
        propName: propName,
        flags: flags,
        resolutionPath: []
      }];
    });
  }

  private isSystemToken(token: any): boolean {
    const name = this.describeToken(token);
    return ANGULAR_INTERNALS.has(name);
  }

  private isIgnoredToken(token: any): boolean {
    if (IGNORED_TOKENS.has(token)) return true;
    const name = this.describeToken(token);
    return IGNORED_TOKENS.has(name);
  }

  private isGenieInternalComponent(name: string): boolean {
    return GENIE_INTERNAL_COMPONENTS.has(name);
  }

  private extractProvidersFromComponent(componentType: Type<any>, node: GenieNode): void {
    const tokensToRegister = new Set<any>();
    const injector = node.injector as any;
    const lView = injector._lView;

    if (lView) {
      const tView = lView[1];
      if (tView && tView.data) {
        for (let i = 0; i < tView.data.length; i++) {
          const item = tView.data[i];
          if (item && typeof item === 'object' && item.token) {
            if (this.isLikelyProviderToken(item.token)) tokensToRegister.add(item.token);
          } else if (typeof item === 'function' || item instanceof InjectionToken) {
            if (this.isLikelyProviderToken(item)) tokensToRegister.add(item);
          }
        }
      }
    } else {
      if (injector.records) {
        injector.records.forEach((value: any, key: any) => {
          if (key && this.isLikelyProviderToken(key)) tokensToRegister.add(key);
        });
      }
    }

    const validServices: { token: any, instance: any }[] = [];

    tokensToRegister.forEach(token => {
      const name = this.describeToken(token);
      if (name && name !== 'Object' && name !== 'Unknown' && name !== '[object Object]') {
        try {
          const instance = injector.get(token, null, {optional: true});
          if (instance) {
            validServices.push({token, instance});
          }
        } catch (e) {

        }
      }
    });

    if (validServices.length > 0) {
      this.registerServices(node, validServices);
    }
  }

  registerServices(node: GenieNode, servicesData: { token: any, instance: any }[]): void {
    if (!servicesData?.length) return;

    const newServices: GenieServiceRegistration[] = [];

    servicesData.forEach(({token, instance}) => {
      if (this.isIgnoredToken(token)) return;

      const existingId = this.instanceToServiceMap.get(instance);

      if (existingId) return;

      const id = this._nextServiceId++;
      const label = this.describeToken(token);

      const isFramework = this.isSystemToken(token);
      const depType = this.getDependencyType(instance, token);
      const providerType = this.guessProviderType(token, instance);

      const reg: GenieServiceRegistration = {
        id,
        nodeId: node.id,
        token,
        instance,
        label: label,

        dependencyType: depType,
        providerType: providerType,
        usageCount: 0,
        properties: this.snapshotProperties(instance),
        isRoot: this.checkIsRoot(token),
        isFramework: isFramework
      };

      this.instanceToServiceMap.set(instance, id);
      newServices.push(reg);
    });

    if (newServices.length > 0) {
      this._services.update(existing => [...existing, ...newServices]);
    }
  }

  private getDependencyType(instance: any, token: any): GenieDependencyType {
    if (!instance) return 'Service';

    if (typeof instance.subscribe === 'function') {
      return 'Observable';
    }

    const ctor = instance.constructor;
    if (ctor) {
      if (ctor.ɵpipe) return 'Pipe';
      if (ctor.ɵcmp) return 'Component';
      if (ctor.ɵdir) return 'Directive';
    }

    if (token instanceof InjectionToken) return 'Token';

    const tokenName = this.describeToken(token);
    if (ANGULAR_CORE_SYSTEM.has(tokenName)) {
      return 'System';
    }

    const ctorName = ctor?.name;
    if (['String', 'Number', 'Boolean', 'Object', 'Array'].includes(ctorName)) {
      return 'Value';
    }

    return 'Service';
  }

  private checkIsRoot(token: any): boolean {
    return token && token['ɵprov'] && token['ɵprov'].providedIn === 'root';
  }

  private isLikelyProviderToken(token: any): boolean {
    if (!token) return false;
    if (typeof token === 'string' || typeof token === 'number' || typeof token === 'boolean') return false;

    if (this.isIgnoredToken(token)) return false;

    const name = this.describeToken(token);
    if (name.startsWith('ɵ')) return false;
    if (name.startsWith('_')) return true;
    if (['ChangeDetector', 'Injector', 'ViewRef', 'ElementRef', 'TemplateRef', 'ViewContainerRef', 'Object', 'Unknown'].some(s => name.includes(s))) return false;
    if (name.startsWith('Ng')) return false;
    if (name.includes('i0')) return false;
    if (typeof token === 'function') return true;
    if (token instanceof InjectionToken) return true;
    return false;
  }

  register(label: string, injector: Injector, parent: GenieNode | null, type: GenieNodeType = 'Environment'): GenieNode {
    const injectorName = injector.constructor.name;
    let nodeType = type;
    if (injectorName === 'NodeInjector') nodeType = 'Element';
    if (injectorName === 'R3Injector') nodeType = 'Environment';

    const node: GenieNode = {
      id: this._nextNodeId++,
      label,
      injector,
      type: nodeType,
      parentId: parent?.id ?? null,
      isActive: true
    };

    try {
      const viewRef = injector.get(ChangeDetectorRef, null) as ViewRef;
      if (viewRef && (viewRef as any).onDestroy) {
        (viewRef as any).onDestroy(() => {
          this.cleanupNode(node.id);
        });
      }
    } catch (e) {
    }

    this._nodes.update(nodes => [...nodes, node]);
    return node;
  }

  private cleanupNode(nodeId: number): void {
    const servicesToRemove = this._services().filter(s => s.nodeId === nodeId);
    const serviceIdsToRemove = new Set(servicesToRemove.map(s => s.id));

    this._nodes.update(nodes => nodes.filter(n => n.id !== nodeId));
    this._services.update(services => services.filter(s => s.nodeId !== nodeId));

    this._dependencies.update(deps => deps.filter(d =>
      d.consumerNodeId !== nodeId &&
      (d.providerId === null || !serviceIdsToRemove.has(d.providerId))
    ));
  }

  guessProviderType(token: any, instance: any): GenieProviderType {
    const type = typeof instance;
    if (type === 'string' || type === 'number' || type === 'boolean') return 'Value';

    if (token && (token as any).ɵprov) {
      const prov = (token as any).ɵprov;
      if (prov.useValue !== undefined) return 'Value';
      if (prov.useFactory !== undefined) return 'Factory';
      if (prov.useExisting !== undefined) return 'Existing';
      if (prov.useClass !== undefined) return 'Class';
    }

    const tokenName = this.describeToken(token);
    const instanceName = instance?.constructor?.name;

    if (instanceName && tokenName === instanceName) return 'Class';
    if (token instanceof InjectionToken) return 'Value';
    if (typeof token === 'function' && instanceName && tokenName !== instanceName) return 'Existing';

    return 'Factory';
  }

  snapshotProperties(instance: any): Record<string, any> {
    if (!instance || typeof instance !== 'object') return {};
    const snapshot: Record<string, any> = {};
    for (const key in instance) {
      if (key.startsWith('_') || key.startsWith('ng') || key.startsWith('ɵ')) continue;
      try {
        const val = instance[key];
        if (isSignal(val)) {
          snapshot[key] = `[Signal] ${val()}`;
          continue;
        }
        if (val && typeof val.subscribe === 'function') {
          snapshot[key] = `[Observable]`;
          continue;
        }
        const type = typeof val;
        if (type === 'string' || type === 'number' || type === 'boolean') {
          snapshot[key] = val;
        } else if (val === null) {
          snapshot[key] = 'null';
        } else if (val === undefined) {
          snapshot[key] = 'undefined';
        } else if (Array.isArray(val)) {
          snapshot[key] = `Array(${val.length})`;
        } else if (type === 'object') {
          snapshot[key] = val.constructor && val.constructor.name !== 'Object' ? `[${val.constructor.name}]` : '{...}';
        }
      } catch (e) {
      }
    }
    return snapshot;
  }

  getServicesForNode(nodeId: number): GenieServiceRegistration[] {
    return this._services().filter(s => s.nodeId === nodeId);
  }

  incrementServiceUsage(serviceId: number, token: unknown): void {
    this._services.update(list =>
      list.map(s =>
        s.id === serviceId ? {...s, usageCount: s.usageCount + 1} : s
      ),
    );
  }

  toggle(): void {
    this._isOpen.update(v => !v);
  }

  reset(): void {
    this._nodes.set([]);
    this._services.set([]);
    this._dependencies.set([]);
    this._nextNodeId = 1;
    this._nextServiceId = 1;
    this._hasWarnedAboutProduction = false;
    this.injectorToNodeMap = new WeakMap();
    this.instanceToServiceMap = new WeakMap();
  }

  findNodeByInjector(injector: Injector): GenieNode | null {
    return this._nodes().find(n => n.injector === injector) ?? null;
  }

  private describeToken(token: unknown): string {
    if (!token) return 'Unknown';
    if (token instanceof InjectionToken) return token.toString().replace('InjectionToken ', '');

    if (typeof token === 'function' && (token as any).name) return (token as any).name;
    if (typeof token === 'string') return token;
    if (typeof token === 'object') {
      if ((token as any).name) return (token as any).name;
      if ((token as any).constructor?.name && (token as any).constructor.name !== 'Object') {
        return (token as any).constructor.name;
      }
    }
    return 'Unknown';
  }
}
