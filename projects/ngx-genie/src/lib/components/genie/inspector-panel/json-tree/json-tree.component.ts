import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  isSignal, ViewEncapsulation
} from '@angular/core';


type DataType =
  'string'
  | 'number'
  | 'bigint'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'undefined'
  | 'function'
  | 'signal'
  | 'symbol';

interface TreeItem {
  key: string;
  value: any;
  type: DataType;
  isExpandable: boolean;
  preview: string;
}

@Component({
  selector: 'lib-json-tree',
  standalone: true,
  imports: [],
  templateUrl: './json-tree.component.html',
  styleUrl: './json-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class JsonTreeComponent {

  readonly key = input<string>('');
  readonly value = input.required<any>();
  readonly isRoot = input<boolean>(false);

  readonly _expanded = signal<boolean>(false);

  readonly _meta = computed(() => this._analyzeValue(this.value()));

  readonly _children = computed<TreeItem[]>(() => {
    if (!this._expanded()) return [];
    return this._generateChildren(this.value(), this._meta().type);
  });

  protected readonly _isEmpty = computed(() => {
    const val = this.value();
    const type = this._meta().type;
    if (type === 'array') return val.length === 0;
    if (type === 'object') return val && Object.keys(val).length === 0;
    return false;
  });

  protected readonly _isComplex = computed(() => {
    const t = this._meta().type;
    return t === 'object' || t === 'array' || t === 'signal';
  });

  constructor() {
    effect(() => {
      if (this.isRoot()) {
        this._expanded.set(true);
      }
    });
  }

  toggle() {
    if (this._meta().isExpandable) {
      this._expanded.update(v => !v);
    }
  }

  private _analyzeValue(val: any) {
    const type = this._getType(val);
    const isExpandable = this._checkExpandable(val, type);
    const preview = this._getPreview(val, type);
    return {type, isExpandable, preview};
  }

  private _getType(val: any): DataType {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (isSignal(val)) return 'signal';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  }

  private _checkExpandable(val: any, type: DataType): boolean {
    if (type === 'array') return val.length > 0;
    if (type === 'object') return val && Object.keys(val).length > 0;
    if (type === 'signal') return true;
    return false;
  }

  private _getPreview(val: any, type: DataType): string {
    switch (type) {
      case 'array':
        return `Array(${val.length})`;
      case 'object':
        return val.constructor?.name || 'Object';
      case 'signal':
        return `Signal`;
      case 'string':
        return `"${val}"`;
      case 'function':
        return 'f()';
      case 'bigint':
        return `${val}n`;
      default:
        return String(val);
    }
  }

  private _generateChildren(val: any, type: DataType): TreeItem[] {
    if (type === 'array') {
      return val.map((item: any, idx: number) => this._createItem(idx.toString(), item));
    }
    if (type === 'object') {
      return Object.keys(val).map(k => this._createItem(k, val[k]));
    }
    if (type === 'signal') {
      try {
        const signalVal = val();
        return [this._createItem('<value>', signalVal)];
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  private _createItem(key: string, value: any): TreeItem {
    const type = this._getType(value);
    return {
      key,
      value,
      type,
      isExpandable: this._checkExpandable(value, type),
      preview: this._getPreview(value, type)
    };
  }
}
