import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal, ViewEncapsulation,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {GenieResizableDirective} from '../../../shared/directives/resizable/resizable.directive';
import {
  GenieTreeNode,
  GenieServiceRegistration,
  GenieDependency
} from '../../../models/genie-node.model';
import {InspectorStateService} from './inspector-state.service';
import {InspectorProvidersListComponent} from './inspector-providers-list/inspector-providers-list.component';
import {InspectorProviderDetailsComponent} from './inspector-provider-details/inspector-provider-details.component';
import {InspectorToolbarComponent} from './inspector-toolbar/inspector-toolbar.component';
import {GenieFilterState} from '../options-panel/options-panel.models';

@Component({
  selector: 'lib-inspector-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    GenieResizableDirective,
    InspectorToolbarComponent,
    InspectorProvidersListComponent,
    InspectorProviderDetailsComponent
  ],
  providers: [InspectorStateService],
  templateUrl: './inspector-panel.component.html',
  styleUrl: './inspector-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class InspectorPanelComponent {

  readonly state = inject(InspectorStateService);
  private el = inject(ElementRef);


  readonly selectedNode = input<GenieTreeNode | null>(null);
  readonly selectedService = input<GenieServiceRegistration | null>(null);
  readonly nodeServices = input<GenieServiceRegistration[]>([]);
  readonly dependencies = input<GenieDependency[]>([]);


  readonly filterState = input<GenieFilterState | null>(null);


  readonly injectionPath = input<GenieTreeNode[]>([]);
  readonly serviceState = input<any>(null);
  readonly isLiveWatch = input(false);


  readonly closeSelection = output<void>();
  readonly selectService = output<GenieServiceRegistration>();
  readonly toggleLiveWatch = output<void>();
  readonly consoleLog = output<void>();


  readonly listHeight = signal(200);
  readonly showToolbar = signal(true);

  constructor() {

    effect(() => this.state.nodeServices.set(this.nodeServices()));
    effect(() => this.state.dependencies.set(this.dependencies()));
    effect(() => this.state.selectedService.set(this.selectedService()));
    effect(() => this.state.filterState.set(this.filterState()));
  }


  toggleToolbar() {
    this.showToolbar.update(v => !v);
  }

  onListResize(delta: number) {
    const hostHeight = this.el.nativeElement.offsetHeight;
    if (!hostHeight) return;

    const minListHeight = 40;


    const minDetailsHeight = 220;

    const headerHeight = 45;
    const toolbarHeight = this.showToolbar() ? 36 : 0;
    const resizerHeight = 12;


    const maxListHeight = hostHeight - headerHeight - toolbarHeight - resizerHeight - minDetailsHeight;

    this.listHeight.update(h => {
      const newHeight = h + delta;

      return Math.max(minListHeight, Math.min(newHeight, maxListHeight));
    });
  }


  snapListToTop() {
    this.listHeight.set(40);
  }


  snapListToBottom() {
    const hostHeight = this.el.nativeElement.offsetHeight;
    if (!hostHeight) return;

    const minDetailsHeight = 220;
    const headerHeight = 45;
    const toolbarHeight = this.showToolbar() ? 36 : 0;
    const resizerHeight = 12;

    const maxListHeight = hostHeight - headerHeight - toolbarHeight - resizerHeight - minDetailsHeight;
    this.listHeight.set(maxListHeight);
  }
}
