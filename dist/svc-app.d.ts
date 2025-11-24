import { ComponentInstaller, Container, Registry } from "@nivinjoseph/n-ject";
import { Logger } from "@nivinjoseph/n-log";
export declare class SvcApp {
    private readonly _container;
    private readonly _ownsContainer;
    private readonly _programKey;
    private _logger;
    private _programRegistered;
    private readonly _disposeActions;
    private _isBootstrapped;
    private _serverPort;
    private _server;
    private _program;
    private _isCleanUp;
    private _shutdownManager;
    get containerRegistry(): Registry;
    constructor(container?: Container);
    useLogger(logger: Logger): this;
    useInstaller(installer: ComponentInstaller): this;
    registerProgram(programClass: Function): this;
    registerDisposeAction(disposeAction: () => Promise<void>): this;
    useHealthCheckServerPort(port: number): this;
    bootstrap(): void;
    private _configureContainer;
    private _configureStartup;
    private _configureShutDown;
    private _cleanUp;
}
//# sourceMappingURL=svc-app.d.ts.map