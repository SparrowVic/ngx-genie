/**
 * Built-in classification of Angular / framework / runtime symbols that GenieOS
 * treats as "internal" (hidden by default).
 *
 * Single source of truth: {@link INTERNAL_CATEGORIES}. The flat `Set` exports are
 * derived from it for backwards compatibility with the registry.
 *
 * NOTE on names: tokens are matched by their runtime class name as produced by
 * `describeToken()` (e.g. `NgIf`, `Router`, `ElementRef`). These are RAW names —
 * historically some sets were `_`-prefixed, which never matched real names. The
 * filter service now normalises a leading `_` before comparing, so both `NgIf`
 * and a mangled `_NgIf` resolve to the same category.
 */

export interface InternalCategory {
  /** Stable id used as the persistence key for the on/off toggle. */
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
  /** Raw class names that belong to this category. */
  readonly names: readonly string[];
  /** Whether the category is hidden by default. */
  readonly defaultHidden: boolean;
}

export const INTERNAL_CATEGORIES: readonly InternalCategory[] = [
  {
    id: 'common-directives',
    label: 'Common Directives',
    icon: '🧩',
    description: 'Structural & attribute directives from @angular/common (NgIf, NgFor, …).',
    defaultHidden: true,
    names: [
      'NgClass', 'NgComponentOutlet', 'NgForOf', 'NgIf', 'NgPlural',
      'NgStyle', 'NgSwitch', 'NgSwitchCase', 'NgSwitchDefault', 'NgTemplateOutlet',
    ],
  },
  {
    id: 'router-directives',
    label: 'Router Directives',
    icon: '🧭',
    description: 'Directives contributed by @angular/router.',
    defaultHidden: true,
    names: ['RouterLink', 'RouterLinkActive', 'RouterOutlet'],
  },
  {
    id: 'forms-directives',
    label: 'Forms Directives',
    icon: '📝',
    description: 'Template-driven & reactive forms directives, value accessors and validators.',
    defaultHidden: true,
    names: [
      'NgNoValidate', 'NgSelectOption', 'NgSelectMultipleOption', 'DefaultValueAccessor',
      'NumberValueAccessor', 'RangeValueAccessor', 'CheckboxControlValueAccessor',
      'SelectControlValueAccessor', 'SelectMultipleControlValueAccessor', 'RadioControlValueAccessor',
      'NgControlStatus', 'NgControlStatusGroup', 'RequiredValidator', 'MinLengthValidator',
      'MaxLengthValidator', 'PatternValidator', 'CheckboxRequiredValidator', 'EmailValidator',
      'MinValidator', 'MaxValidator', 'NgModel', 'NgModelGroup', 'NgForm',
      'FormControlDirective', 'FormGroupDirective', 'FormArrayDirective', 'FormControlName',
      'FormGroupName', 'FormArrayName', 'AbstractFormGroupDirective', 'BuiltInControlValueAccessor',
      'AbstractValidatorDirective', 'ControlValueAccessor',
    ],
  },
  {
    id: 'common-pipes',
    label: 'Common Pipes',
    icon: '🔧',
    description: 'Built-in pipes from @angular/common (async, date, json, …).',
    defaultHidden: true,
    names: [
      'AsyncPipe', 'LowerCasePipe', 'TitleCasePipe', 'UpperCasePipe', 'DatePipe',
      'I18nPluralPipe', 'I18nSelectPipe', 'JsonPipe', 'KeyValuePipe', 'DecimalPipe',
      'PercentPipe', 'CurrencyPipe', 'SlicePipe',
    ],
  },
  {
    id: 'core-system',
    label: 'Core System & Refs',
    icon: '⚙️',
    description: 'Angular runtime references and mechanics (ElementRef, NgZone, Injector, …).',
    defaultHidden: true,
    names: [
      'ElementRef', 'ChangeDetectorRef', 'ViewContainerRef', 'TemplateRef', 'ViewRef',
      'NgModuleRef', 'ApplicationRef', 'PlatformRef', 'OutputEmitterRef',
      'Injector', 'NodeInjector', 'EnvironmentInjector', 'Renderer2', 'Compiler',
      'NoneEncapsulationDomRenderer', 'NgZone', 'QueryList', 'EventEmitter', 'EventEmitter_', 'DestroyRef',
    ],
  },
  {
    id: 'framework-services',
    label: 'Framework Services',
    icon: '🛰️',
    description: 'Common injectable services shipped by Angular (Router, HttpClient, …).',
    defaultHidden: true,
    names: [
      'Router', 'ActivatedRoute', 'Location', 'Title', 'HttpClient',
      'DomSanitizer', 'Meta', 'TransferState',
    ],
  },
  {
    id: 'rxjs',
    label: 'RxJS Primitives',
    icon: '🌀',
    description: 'RxJS Observable/Subject instances surfaced as dependencies.',
    defaultHidden: true,
    names: ['Observable', 'Subject', 'BehaviorSubject', 'ReplaySubject', 'AsyncSubject'],
  },
  {
    id: 'native-js',
    label: 'Native JS & Browser',
    icon: '🌐',
    description: 'Built-in JavaScript / DOM constructors (HTMLElement, Document, Array, …).',
    defaultHidden: true,
    names: [
      'HTMLElement', 'HTMLDocument', 'Function', 'Window', 'Document',
      'Array', 'Object', 'Promise', 'Map', 'Set', 'Date',
    ],
  },
];

/** Normalise a token name for category comparison (strip a single leading `_`). */
export function normalizeInternalName(name: string): string {
  return name.startsWith('_') ? name.slice(1) : name;
}

/** Lookup: normalized name → category id. */
export const INTERNAL_NAME_TO_CATEGORY: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const category of INTERNAL_CATEGORIES) {
    for (const name of category.names) map.set(name, category.id);
  }
  return map;
})();

// --- Backwards-compatible flat exports (raw names) --------------------------

/** Core Angular runtime references/mechanics — used directly by the registry. */
export const ANGULAR_CORE_SYSTEM = new Set(
  INTERNAL_CATEGORIES.find((c) => c.id === 'core-system')!.names,
);

/** Union of every built-in internal name (raw). */
export const ANGULAR_INTERNALS = new Set(
  INTERNAL_CATEGORIES.flatMap((c) => c.names),
);
