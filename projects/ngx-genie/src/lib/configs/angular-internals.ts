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
  'ElementRef',
  'ChangeDetectorRef',
  'ViewContainerRef',
  'Injector',
  'TemplateRef',
  'ViewRef',
  'Renderer2',
  'Compiler',
  'NgModuleRef',
  'NoneEncapsulationDomRenderer',
  'OutputEmitterRef',
  'ApplicationRef',
  'PlatformRef',
  'NgZone'
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

export const ANGULAR_INTERNALS = new Set([
  ...ANGULAR_INTERNAL_DIRECTIVES,
  ...ANGULAR_INTERNAL_COMMON_PIPES,
  ...ANGULAR_CORE_SYSTEM,
  ...ANGULAR_FRAMEWORK_SERVICES
]);
