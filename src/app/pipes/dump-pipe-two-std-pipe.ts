import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
  name: 'dumpPipeTwoStd',
  standalone: true
})
export class DumpPipeTwoStdPipe implements PipeTransform {

  transform(value: unknown, ...args: unknown[]): unknown {
    return null;
  }

}
