import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ToastTone = 'info' | 'success' | 'warn';

export interface Toast {
  readonly id: number;
  readonly title: string;
  readonly message: string;
  readonly tone: ToastTone;
  readonly icon: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private seq = 0;

  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();
  readonly count = computed(() => this._toasts().length);

  push(input: { title: string; message: string; tone?: ToastTone; icon?: string }, ttl = 3400): number {
    const id = ++this.seq;
    const toast: Toast = {
      id,
      title: input.title,
      message: input.message,
      tone: input.tone ?? 'info',
      icon: input.icon ?? 'sparkles',
    };
    this._toasts.update((list) => [...list, toast]);
    if (this.isBrowser) {
      setTimeout(() => this.dismiss(id), ttl);
    }
    return id;
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  clear(): void {
    this._toasts.set([]);
  }
}
