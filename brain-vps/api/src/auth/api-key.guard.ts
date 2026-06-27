import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];
    const validKey = this.config.get<string>('BRAIN_API_KEY');

    if (!validKey || validKey.length < 32) {
      throw new UnauthorizedException('API Key não configurada corretamente no servidor');
    }

    if (!providedKey || typeof providedKey !== 'string') {
      throw new UnauthorizedException('API Key ausente');
    }

    // Comparação resistente a timing attacks
    const providedBuf = Buffer.from(providedKey);
    const validBuf = Buffer.from(validKey);

    if (
      providedBuf.length !== validBuf.length ||
      !timingSafeEqual(providedBuf, validBuf)
    ) {
      throw new UnauthorizedException('API Key inválida');
    }

    return true;
  }
}
