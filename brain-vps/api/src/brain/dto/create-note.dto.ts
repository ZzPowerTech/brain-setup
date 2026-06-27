import { IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'O campo "path" não pode ser vazio' })
  @MaxLength(500, { message: 'Caminho muito longo' })
  @Matches(/^[^<>:"|?*\x00-\x1f]+\.md$/, {
    message: 'O caminho deve ser um arquivo .md sem caracteres inválidos',
  })
  path!: string;

  @IsString()
  @IsNotEmpty({ message: 'O campo "content" não pode ser vazio' })
  @MaxLength(200000, { message: 'Conteúdo excede o limite máximo de 200.000 caracteres' })
  content!: string;

  @IsOptional()
  @IsObject({ message: 'O frontmatter deve ser um objeto' })
  frontmatter?: Record<string, unknown>;
}
