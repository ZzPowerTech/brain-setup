import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

const NOTE_PATH_REGEX = /^[^<>:"|?*\x00-\x1f]+\.md$/;

/**
 * Renomeia/move uma nota dentro do vault. `path` é a origem e `newPath` o destino.
 * Não sobrescreve um destino já existente.
 */
export class RenameNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'O campo "path" (origem) não pode ser vazio' })
  @MaxLength(500, { message: 'Caminho de origem muito longo' })
  @Matches(NOTE_PATH_REGEX, {
    message: 'A origem deve ser um arquivo .md sem caracteres inválidos',
  })
  path!: string;

  @IsString()
  @IsNotEmpty({ message: 'O campo "newPath" (destino) não pode ser vazio' })
  @MaxLength(500, { message: 'Caminho de destino muito longo' })
  @Matches(NOTE_PATH_REGEX, {
    message: 'O destino deve ser um arquivo .md sem caracteres inválidos',
  })
  newPath!: string;
}
