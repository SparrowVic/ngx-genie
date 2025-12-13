import {Injectable, signal, computed} from '@angular/core';

@Injectable()
export class OrderDetailsService {
  readonly id = 'OrderDetailsService';


  isLoading = signal(false);
  hasError = signal(false);


  details = signal<{ address: string, items: number[] } | null>(null);


  canShowDetails = computed(() => !this.isLoading() && this.details() !== null);
}
