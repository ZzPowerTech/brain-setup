import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { LoginDto } from './dto/login.dto';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

@Controller('auth')
export class AuthController {
  constructor(private readonly config: ConfigService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto): { success: boolean; expiresAt: string } {
    const validKey = this.config.get<string>('BRAIN_API_KEY');

    if (!validKey || validKey.length < 32) {
      throw new UnauthorizedException('API Key não configurada no servidor');
    }

    const providedBuf = Buffer.from(body.apiKey);
    const validBuf = Buffer.from(validKey);

    if (
      providedBuf.length !== validBuf.length ||
      !timingSafeEqual(providedBuf, validBuf)
    ) {
      throw new UnauthorizedException('API Key inválida');
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    return { success: true, expiresAt };
  }
}
