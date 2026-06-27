import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'O parâmetro de busca "q" não pode ser vazio' })
  @MaxLength(200, { message: 'Query de busca muito longa (máx 200 chars)' })
  q!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 10;
}
