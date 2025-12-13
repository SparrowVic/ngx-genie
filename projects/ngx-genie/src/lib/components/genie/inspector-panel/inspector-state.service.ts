import {computed, Injectable, signal} from '@angular/core';
import {
  GenieDependency,
  GenieProviderType,
  GenieServiceRegistration,
  InjectionFlags
} from '../../../models/genie-node.model';
import {GenieDependencyType} from '../../../services/genie-registry.service';
import {GenieFilterState} from '../options-panel/options-panel.models';

export interface InspectorViewModel extends GenieServiceRegistration {
  dependencyFlags?: InjectionFlags;
  isUsed: boolean;
  matchesGlobal: boolean;
}

@Injectable()
export class InspectorStateService {

  readonly nodeServices = signal<GenieServiceRegistration[]>([]);
  readonly dependencies = signal<GenieDependency[]>([]);
  readonly selectedService = signal<GenieServiceRegistration | null>(null);

  readonly filterState = signal<GenieFilterState | null>(null);
  readonly syncEnabled = signal<boolean>(true);

  readonly search = signal<string>('');
  readonly typeFilter = signal<GenieProviderType | 'All'>('All');
  readonly depTypeFilter = signal<GenieDependencyType | 'All'>('All');
  readonly modFilter = signal<'All' | 'Optional' | 'SkipSelf' | 'Host' | 'Self'>('All');

  private readonly _servicesWithMeta = computed<InspectorViewModel[]>(() => {
    const services = this.nodeServices();
    const deps = this.dependencies();
    const globalFilter = this.filterState();

    return services.map(svc => {
      const dep = deps.find(d => d.providerId === svc.id);

      const isUsed = (svc.usageCount || 0) > 0;
      const type = svc.dependencyType || 'Service';
      const isFramework = svc.isFramework;

      let matchesGlobal = true;
      if (globalFilter) {
        if (globalFilter.hideInternals && isFramework) {
          matchesGlobal = false;
        } else if (globalFilter.hideUnusedDeps && !isUsed) {
          matchesGlobal = false;
        } else {
          if (isFramework) {
            if (type === 'Service' && !globalFilter.showFrameworkServices) matchesGlobal = false;
            else if (type === 'System' && !globalFilter.showFrameworkSystem) matchesGlobal = false;
            else if (type === 'Token' && !globalFilter.showFrameworkTokens) matchesGlobal = false;
            else if (type === 'Observable' && !globalFilter.showFrameworkObservables) matchesGlobal = false;
            else if (type === 'Component' && !globalFilter.showFrameworkComponents) matchesGlobal = false;
            else if (type === 'Directive' && !globalFilter.showFrameworkDirectives) matchesGlobal = false;
            else if (type === 'Pipe' && !globalFilter.showFrameworkPipes) matchesGlobal = false;
          } else {
            if (type === 'Service' && !globalFilter.showUserServices) matchesGlobal = false;
            else if (type === 'Token' && !globalFilter.showUserTokens) matchesGlobal = false;
            else if (type === 'Value' && !globalFilter.showUserValues) matchesGlobal = false;
            else if (type === 'Observable' && !globalFilter.showUserObservables) matchesGlobal = false;
            else if (type === 'Component' && !globalFilter.showUserComponents) matchesGlobal = false;
            else if (type === 'Directive' && !globalFilter.showUserDirectives) matchesGlobal = false;
            else if (type === 'Pipe' && !globalFilter.showUserPipes) matchesGlobal = false;
          }
        }
      }

      return {
        ...svc,
        dependencyFlags: dep?.flags,
        isUsed,
        matchesGlobal
      };
    });
  });

  readonly filteredServices = computed(() => {
    let services = this._servicesWithMeta();

    const s = this.search().toLowerCase();
    const tF = this.typeFilter();
    const dtF = this.depTypeFilter();
    const mF = this.modFilter();

    if (s) services = services.filter(item => item.label.toLowerCase().includes(s));
    if (tF !== 'All') services = services.filter(item => item.providerType === tF);

    if (dtF !== 'All') services = services.filter(item => item.dependencyType === dtF);

    if (mF !== 'All') {
      services = services.filter(item => {
        const f = item.dependencyFlags;
        if (!f) return false;
        if (mF === 'Optional') return f.optional;
        if (mF === 'SkipSelf') return f.skipSelf;
        if (mF === 'Host') return f.host;
        if (mF === 'Self') return f.self;
        return false;
      });
    }

    if (this.syncEnabled()) {
      services = services.filter(item => item.matchesGlobal);
    }

    return services;
  });
}
