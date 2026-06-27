import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class AppendNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'O campo "path" não pode ser vazio' })
  @MaxLength(500, { message: 'Caminho muito longo' })
  @Matches(/^[^<>:"|?*\x00-\x1f]+\.md$/, {
    message: 'O caminho deve ser um arquivo .md sem caracteres inválidos',
  })
  path!: string;

  @IsString()
  @IsNotEmpty({ message: 'O campo "content" não pode ser vazio' })
  @MaxLength(50000, { message: 'Conteúdo muito longo (máx 50000 chars)' })
  content!: string;
}
