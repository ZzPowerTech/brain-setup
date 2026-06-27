import { IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class ToggleTaskDto {
  @IsString()
  @IsNotEmpty({ message: 'O campo "file" não pode ser vazio' })
  @MaxLength(500, { message: 'Caminho muito longo' })
  @Matches(/^[^<>:"|?*\x00-\x1f]+\.md$/, {
    message: 'O caminho deve ser um arquivo .md sem caracteres inválidos',
  })
  file!: string;

  @IsInt()
  @Min(1, { message: 'O número de linha deve ser maior que zero' })
  @Max(100000, { message: 'Número de linha excede o máximo permitido' })
  line!: number;
}
