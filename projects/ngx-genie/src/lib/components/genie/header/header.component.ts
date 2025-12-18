import {ChangeDetectionStrategy, Component, inject, input, output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DomSanitizer, SafeHtml} from '@angular/platform-browser';
import {GENIE_ICONS} from '../../../resources/icons/icons';

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
  private sanitizer = inject(DomSanitizer);

  stats = input.required<{ nodes: number; services: number }>();
  searchQuery = input.required<string>();
  isMaximized = input.required<boolean>();

  searchQueryChange = output<string>();
  maximize = output<void>();
  close = output<void>();
  dragStart = output<MouseEvent>();

  readonly repoUrl = 'https://github.com/SparrowVic/ngx-genie';
  readonly githubIcon: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(GENIE_ICONS.GITHUB_MARK_WHITE);

  onMouseDown(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('button, input, a')) return;
    this.dragStart.emit(event);
  }
}
