// --- DIRECTIVES --- //
export const ANGULAR_INTERNAL_FORMS_DIRECTIVES = new Set([
  // FORM_DIRECTIVES
  'NgNoValidate',
  'NgSelectOption',
  'NgSelectMultipleOption',
  'DefaultValueAccessor',
  'NumberValueAccessor',
  'RangeValueAccessor',
  'CheckboxControlValueAccessor',
  'SelectControlValueAccessor',
  'SelectMultipleControlValueAccessor',
  'RadioControlValueAccessor',
  'NgControlStatus',
  'NgControlStatusGroup',
  'RequiredValidator',
  'MinLengthValidator',
  'MaxLengthValidator',
  'PatternValidator',
  'CheckboxRequiredValidator',
  'EmailValidator',
  'MinValidator',
  'MaxValidator',
  // TEMPLATE_DRIVEN_DIRECTIVES
  'NgModel',
  'NgModelGroup',
  'NgForm',
  // REACTIVE_DRIVEN_DIRECTIVES
  'FormControlDirective',
  'FormGroupDirective',
  'FormArrayDirective',
  'FormControlName',
  'FormGroupName',
  'FormArrayName',
  // OTHER
  'AbstractFormGroupDirective',
  'BuiltInControlValueAccessor',
  'AbstractValidatorDirective',
  'ControlValueAccessor'
]);

export const ANGULAR_INTERNAL_COMMON_DIRECTIVES = new Set([
  'NgClass',
  'NgComponentOutlet',
  'NgForOf',
  'NgIf',
  'NgPlural',
  'NgStyle',
  'NgSwitch',
  'NgSwitchCase',
  'NgSwitchDefault',
  'NgTemplateOutlet',
]);

export const ANGULAR_INTERNAL_ROUTER_DIRECTIVES = new Set([
  'RouterLink',
  'RouterLinkActive',
  'RouterOutlet',
]);

export const ANGULAR_INTERNAL_DIRECTIVES = new Set([
  ...ANGULAR_INTERNAL_FORMS_DIRECTIVES,
  ...ANGULAR_INTERNAL_COMMON_DIRECTIVES,
  ...ANGULAR_INTERNAL_ROUTER_DIRECTIVES,
].map(item => `_${item}`));


// --- PIPES --- //
export const ANGULAR_INTERNAL_COMMON_PIPES = new Set([
  'AsyncPipe',
  'LowerCasePipe',
  'TitleCasePipe',
  'UpperCasePipe',
  'DatePipe',
  'I18nPluralPipe',
  'I18nSelectPipe',
  'JsonPipe',
  'KeyValuePipe',
  'DecimalPipe',
  'PercentPipe',
  'CurrencyPipe',
  'SlicePipe',
].map(item => `_${item}`));


// (TODO) --- SERVICES  --- //
export const ANGULAR_CORE_SYSTEM = new Set([
  // Refs
  'ElementRef',
  'ChangeDetectorRef',
  'ViewContainerRef',
  'TemplateRef',
  'ViewRef',
  'NgModuleRef',
  'ApplicationRef',
  'PlatformRef',
  'OutputEmitterRef',

  // Core Mechanics
  'Injector',
  'NodeInjector',
  'Renderer2',
  'Compiler',
  'NoneEncapsulationDomRenderer',
  'NgZone',
  'QueryList',
  'EventEmitter',
  'EventEmitter_',

  // Internal properties / Dump keys
  '_NgZone',
  'EventEmitter_',
  'NodeInjector'
]);

export const ANGULAR_FRAMEWORK_SERVICES = new Set([
  'Router',
  'ActivatedRoute',
  'Location',
  'Title',
  'HttpClient',
  'DomSanitizer',
  'Meta',
  'TransferState'
].map(item => `_${item}`));

// --- RXJS --- //
export const ANGULAR_INTERNAL_RXJS = new Set([
  'Observable2',
  'Subject2',
  'BehaviorSubject2',
]);

// --- NATIVE BROWSER / JS OBJECTS --- //
export const NATIVE_JS_ENTITIES = new Set([
  'HTMLElement',
  'HTMLDocument',
  'Function',
  'Window',
  'Document',
  'Array',
  'Object',
  'Promise'
]);

export const ANGULAR_INTERNALS = new Set([
  ...ANGULAR_INTERNAL_DIRECTIVES,
  ...ANGULAR_INTERNAL_COMMON_PIPES,
  ...ANGULAR_CORE_SYSTEM,
  ...ANGULAR_FRAMEWORK_SERVICES,
  ...ANGULAR_INTERNAL_RXJS,
  ...NATIVE_JS_ENTITIES
]);
