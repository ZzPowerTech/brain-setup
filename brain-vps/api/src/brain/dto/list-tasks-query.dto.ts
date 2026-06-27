import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ListTasksQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  daily?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  done?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  todo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Caminho muito longo' })
  @Matches(/^[^<>:"|?*\x00-\x1f]+$/, {
    message: 'O caminho contém caracteres inválidos',
  })
  path?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number = 100;
}
