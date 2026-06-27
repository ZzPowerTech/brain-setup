import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class AppendDailyDto {
  @IsString()
  @IsNotEmpty({ message: 'O campo "content" não pode ser vazio' })
  @MaxLength(50000, { message: 'Conteúdo muito longo (máx 50000 chars)' })
  content!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Formato de data inválido. Use YYYY-MM-DD',
  })
  date?: string;
}
