import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import type { ApiResponse } from 'fiken-shared';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return a successful API response with "Hello World!"', () => {
      const result: ApiResponse<string> = appController.getHello();
      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello World!');
      expect(result.message).toBe('Welcome to Fiken AI!');
    });
  });
});
