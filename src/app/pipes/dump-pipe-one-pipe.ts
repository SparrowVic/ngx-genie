import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'dumpPipeOne'
})
export class DumpPipeOnePipe implements PipeTransform {

  transform(value: unknown, ...args: unknown[]): unknown {
    return null;
  }

}
