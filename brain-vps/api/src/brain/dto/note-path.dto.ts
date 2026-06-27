import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';

export class NotePathDto {
  @IsString()
  @IsNotEmpty({ message: 'O parâmetro "path" não pode ser vazio' })
  @MaxLength(500, { message: 'Caminho muito longo' })
  @Matches(/^[^<>:"|?*\x00-\x1f]+\.md$/, {
    message: 'O caminho deve ser um arquivo .md sem caracteres inválidos',
  })
  path!: string;
}
