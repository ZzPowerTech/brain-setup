import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';

export class ProjectNameDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do projeto não pode ser vazio' })
  @MaxLength(100, { message: 'Nome do projeto muito longo (máx 100 chars)' })
  @Matches(/^[a-zA-Z0-9_\-. ]+$/, {
    message: 'Nome do projeto contém caracteres inválidos',
  })
  name!: string;
}
