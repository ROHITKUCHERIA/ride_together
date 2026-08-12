import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { PublicUser } from '../auth/types/auth.types';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'User not found.',
        ErrorCodes.USER_NOT_FOUND,
      );
    }
    return user;
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<PublicUser> {
    const data: { name?: string; avatarUrl?: string } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: PUBLIC_USER_SELECT,
    });
    return user;
  }
}
