import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Edição in-place por âncora (str_replace), espelhando a semântica do Edit tool:
 * substitui a ocorrência única de `oldString` por `newString`. Use `replaceAll`
 * para trocar todas as ocorrências de uma vez.
 */
export class UpdateNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'O campo "path" não pode ser vazio' })
  @MaxLength(500, { message: 'Caminho muito longo' })
  @Matches(/^[^<>:"|?*\x00-\x1f]+\.md$/, {
    message: 'O caminho deve ser um arquivo .md sem caracteres inválidos',
  })
  path!: string;

  @IsString()
  @IsNotEmpty({ message: 'O campo "oldString" (âncora) não pode ser vazio' })
  @MaxLength(50000, { message: 'Âncora muito longa (máx 50000 chars)' })
  oldString!: string;

  // Pode ser string vazia — permite remover o trecho ancorado
  @IsString({ message: 'O campo "newString" deve ser uma string' })
  @MaxLength(200000, { message: 'Conteúdo excede o limite máximo de 200.000 caracteres' })
  newString!: string;

  @IsOptional()
  @IsBoolean({ message: 'O campo "replaceAll" deve ser booleano' })
  replaceAll?: boolean;
}
