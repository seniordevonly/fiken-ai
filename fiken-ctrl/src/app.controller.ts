import { Controller, Get, Param } from '@nestjs/common';
import { AppService } from './app.service';
import type { ApiResponse } from 'fiken-shared';
import { ResponseUtils, ValidationUtils } from 'fiken-shared';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): ApiResponse<string> {
    const message = this.appService.getHello();
    return ResponseUtils.success(message, 'Welcome to Fiken AI!');
  }

  @Get('validate-email/:email')
  validateEmail(@Param('email') email: string): ApiResponse<boolean> {
    const isValid = ValidationUtils.isValidEmail(email);
    return ResponseUtils.success(isValid, `Email validation result for: ${email}`);
  }
}
