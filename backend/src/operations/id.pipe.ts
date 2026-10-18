import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
@Injectable()
export class ResourceIdPipe implements PipeTransform<string, number> {
  transform(value: string) {
    if (
      !/^[1-9]\d*$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) > 2147483647
    ) {
      throw new BadRequestException('ID deve ser um inteiro positivo válido');
    }
    return Number(value);
  }
}
