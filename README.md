# n-svc
Service Application Framework

## Overview
n-svc is a robust service application framework designed for building scalable and maintainable Node.js services. It provides a structured way to create, manage, and control service applications with built-in support for dependency injection, logging, configuration management, and graceful shutdown handling.

## Features
- Dependency Injection using `@nivinjoseph/n-ject`
- Configurable logging with `@nivinjoseph/n-log`
- Configuration management with `@nivinjoseph/n-config`
- Graceful shutdown handling
- Program lifecycle management
- TypeScript support
- Modular and extensible architecture

## Installation
```bash
npm i @nivinjoseph/n-svc

or 

yarn add @nivinjoseph/n-svc
```

## Quick Start
```typescript
import { SvcApp } from "@nivinjoseph/n-svc";
import { ConsoleLogger } from "@nivinjoseph/n-log";
import { ComponentInstaller, Registry } from "@nivinjoseph/n-ject";

// Define your program
class MyProgram {
    async start(): Promise<void> {
        // Initialize your service
    }

    async stop(): Promise<void> {
        // Clean up resources
    }
}

// Create and configure the service
const service = new SvcApp();

service
    .useLogger(new ConsoleLogger())
    .useInstaller(new MyInstaller())
    .registerProgram(MyProgram)
    .bootstrap();
```

## Core Concepts

### SvcApp
The main application class that orchestrates the service lifecycle. It provides methods for:
- Configuring logging
- Installing dependencies
- Registering the main program
- Managing shutdown and cleanup

### Program
The core interface that your service must implement:
```typescript
interface Program {
    start(): Promise<void>;
    stop(): Promise<void>;
}
```

### Component Installation
Use the `ComponentInstaller` interface to register dependencies:
```typescript
class MyInstaller implements ComponentInstaller {
    install(registry: Registry): void {
        registry
            .registerSingleton("MyService", MyService)
            .registerInstance("Config", config);
    }
}
```

## Configuration
The framework uses `@nivinjoseph/n-config` for configuration management. Configuration can be provided through:
- Environment variables
- Configuration files
- Command line arguments

## Logging
Built-in support for logging through `@nivinjoseph/n-log`:
```typescript
import { ConsoleLogger } from "@nivinjoseph/n-log";

const logger = new ConsoleLogger({
    useJsonFormat: true // For production environments
});
```

## Shutdown Management
The framework handles graceful shutdown through:
- SIGTERM and SIGINT signals
- Programmatic shutdown
- Resource cleanup
- Disposable actions

## Dependencies
- @nivinjoseph/n-config
- @nivinjoseph/n-defensive
- @nivinjoseph/n-exception
- @nivinjoseph/n-ext
- @nivinjoseph/n-ject
- @nivinjoseph/n-log
- @nivinjoseph/n-util

## Requirements
- Node.js >= 20.10
- TypeScript support

## Contributing
Contributions are welcome! Please follow the existing code style and include tests for new features.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

