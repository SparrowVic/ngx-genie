import {Directive, ElementRef, inject, input, Input, InputSignal, OnChanges} from '@angular/core';

@Directive({
  selector: '[genieSvgIcon]',
  standalone: true
})
export class SvgIconDirective implements OnChanges {
  private readonly elementRef = inject(ElementRef);
  svgContent: InputSignal<string> = input.required({alias: 'genieSvgIcon'});

  ngOnChanges(): void {
    this.updateIcon();
  }

  private updateIcon(): void {
    if (!this.svgContent()) {
      this.elementRef.nativeElement.innerHTML = '';
      return;
    }

    this.elementRef.nativeElement.innerHTML = this.svgContent();
    this.elementRef.nativeElement.classList.add('ngx-genie-icon-host');
  }
}
