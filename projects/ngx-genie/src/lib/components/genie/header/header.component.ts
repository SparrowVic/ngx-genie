import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'lib-header',
  standalone: true,
  imports: [
    FormsModule
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {

  stats = input.required<{ nodes: number; services: number }>();
  searchQuery = input.required<string>();
  isMaximized = input.required<boolean>();


  searchQueryChange = output<string>();
  maximize = output<void>();
  close = output<void>();
  dragStart = output<MouseEvent>();

  onMouseDown(event: MouseEvent) {

    if ((event.target as HTMLElement).closest('button, input')) return;
    this.dragStart.emit(event);
  }
}
