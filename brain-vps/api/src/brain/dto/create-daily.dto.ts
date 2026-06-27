import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateDailyDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Formato de data inválido. Use YYYY-MM-DD',
  })
  date?: string;
}
