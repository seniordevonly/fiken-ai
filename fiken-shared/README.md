# Fiken Shared

Shared utilities, types, and common functionality for Fiken projects.

## Overview

This package contains shared code that can be used across multiple Fiken projects, including:

- Common TypeScript types and interfaces
- Utility functions for API responses
- Validation utilities
- Shared constants and configurations

## Installation

This is a private package used within the Fiken monorepo. It's installed as a local dependency.

## Usage

```typescript
import { 
  ApiResponse, 
  ResponseUtils, 
  ValidationUtils 
} from 'fiken-shared';

// Create standardized API responses
const response = ResponseUtils.success({ id: 1, name: 'Test' });

// Use validation utilities
const isValid = ValidationUtils.isValidEmail('test@example.com');
```

## Development

### Building

```bash
npm run build
```

### Watch mode

```bash
npm run build:watch
```

## Structure

```
src/
├── types/           # Shared TypeScript types and interfaces
├── utils/           # Utility functions
└── index.ts         # Main export file
```
