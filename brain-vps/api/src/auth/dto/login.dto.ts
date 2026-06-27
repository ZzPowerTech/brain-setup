import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(32)
  apiKey!: string;
}
