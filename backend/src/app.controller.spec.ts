import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return ok status when the database is reachable', async () => {
      const result = await appController.health();
      expect(result.status).toBe('ok');
      expect(typeof result.timestamp).toBe('string');
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should return 503 when the database is unreachable', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
      await expect(appController.health()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
