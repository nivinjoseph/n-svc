import { ConfigurationManager } from "@nivinjoseph/n-config";
import { given } from "@nivinjoseph/n-defensive";
import { InvalidOperationException } from "@nivinjoseph/n-exception";
import { Container } from "@nivinjoseph/n-ject";
import { ConsoleLogger } from "@nivinjoseph/n-log";
import { ShutdownManager } from "./shutdown-manager.js";
import * as http from "node:http";
// public
export class SvcApp {
    get containerRegistry() { return this._container; }
    constructor(container) {
        this._programKey = "$program";
        this._programRegistered = false;
        this._disposeActions = new Array();
        this._isBootstrapped = false;
        this._serverPort = 8080;
        // private _isShutDown = false;
        this._isCleanUp = false;
        given(container, "container").ensureIsObject().ensureIsType(Container);
        if (container == null) {
            this._container = new Container();
            this._ownsContainer = true;
        }
        else {
            this._container = container;
            this._ownsContainer = false;
        }
    }
    useLogger(logger) {
        if (this._isBootstrapped)
            throw new InvalidOperationException("useLogger");
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
        return this;
    }
    useInstaller(installer) {
        if (this._isBootstrapped)
            throw new InvalidOperationException("useInstaller");
        given(installer, "installer").ensureHasValue();
        this._container.install(installer);
        return this;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    registerProgram(programClass) {
        if (this._isBootstrapped || this._programRegistered)
            throw new InvalidOperationException("registerProgram");
        given(programClass, "programClass").ensureHasValue().ensureIsFunction();
        this._container.registerSingleton(this._programKey, programClass);
        this._programRegistered = true;
        return this;
    }
    registerDisposeAction(disposeAction) {
        if (this._isBootstrapped)
            throw new InvalidOperationException("registerForDispose");
        given(disposeAction, "disposeAction").ensureHasValue().ensureIsFunction();
        this._disposeActions.push(() => {
            return new Promise((resolve) => {
                try {
                    disposeAction()
                        .then(() => resolve())
                        .catch((e) => {
                        // eslint-disable-next-line @typescript-eslint/no-floating-promises
                        this._logger.logError(e)
                            .finally(() => resolve());
                        // resolve();
                        // // tslint:disable-next-line
                        // this._logger.logError(e).then(() => resolve());
                    });
                }
                catch (error) {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    this._logger.logError(error).finally(() => resolve());
                    // resolve();
                    // // tslint:disable-next-line
                    // this._logger.logError(error).then(() => resolve());
                }
            });
        });
        return this;
    }
    useHealthCheckServerPort(port) {
        if (this._isBootstrapped)
            throw new InvalidOperationException("useHealthCheckServerPort");
        given(port, "port").ensureHasValue().ensureIsNumber();
        this._serverPort = port;
        return this;
    }
    bootstrap() {
        if (this._isBootstrapped || !this._programRegistered)
            throw new InvalidOperationException("bootstrap");
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!this._logger)
            this._logger = new ConsoleLogger({
                useJsonFormat: ConfigurationManager.getConfig("env") !== "dev"
            });
        this._configureContainer();
        this._configureStartup()
            .then(async () => {
            const appEnv = ConfigurationManager.getConfig("env");
            const appName = ConfigurationManager.getConfig("package.name");
            const appVersion = ConfigurationManager.getConfig("package.version");
            const appDescription = ConfigurationManager.getConfig("package.description");
            await this._logger.logInfo(`ENV: ${appEnv}; NAME: ${appName}; VERSION: ${appVersion}; DESCRIPTION: ${appDescription}.`);
            this._configureShutDown();
            const p = this._program.start();
            this._isBootstrapped = true;
            await this._logger.logInfo("SERVICE STARTED");
            await p;
        })
            .then(async () => {
            if (!this._shutdownManager.isShutdown)
                await this._cleanUp();
        })
            .then(async () => {
            if (!this._shutdownManager.isShutdown)
                await this._logger.logInfo(`SERVICE COMPLETE`);
        })
            .catch(async (err) => {
            await this._logger.logWarning(`SERVICE ERROR`);
            await this._logger.logError(err);
            process.exit(1);
        });
    }
    _configureContainer() {
        if (this._ownsContainer)
            this._container.bootstrap();
        this.registerDisposeAction(() => this._container.dispose());
    }
    async _configureStartup() {
        await this._logger.logInfo(`SERVICE STARTING...`);
        try {
            const server = http.createServer((req, res) => {
                if (req.url === "/healthCheck") {
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "text/plain");
                    res.end("AVAILABLE");
                }
                else {
                    res.statusCode = 404;
                    res.setHeader("Content-Type", "text/plain");
                    res.end("NOT FOUND");
                }
            });
            await new Promise((resolve, _reject) => {
                server.listen(this._serverPort, () => {
                    resolve();
                });
                this._server = server;
            });
            await this._logger.logInfo(`STARTED HEALTH CHECK SERVER ON PORT ${this._serverPort}`);
        }
        catch (error) {
            await this._logger.logInfo(`ERROR STARTING HEALTH CHECK SERVER ON PORT ${this._serverPort}`);
            throw error;
        }
        this._program = this._container.resolve(this._programKey);
    }
    _configureShutDown() {
        this.registerDisposeAction(async () => {
            await this._logger.logInfo("CLEANING UP. PLEASE WAIT...");
            // return Delay.seconds(ConfigurationManager.getConfig<string>("env") === "dev" ? 2 : 20);
        });
        this._shutdownManager = new ShutdownManager(this._logger, [
            async () => {
                try {
                    await this._logger.logInfo("STOPPING PROGRAM...");
                    await this._program.stop();
                    await this._logger.logInfo("PROGRAM STOPPED");
                }
                catch (error) {
                    await this._logger.logWarning("ERROR STOPPING PROGRAM");
                    await this._logger.logError(error);
                }
                finally {
                    try {
                        await new Promise((resolve, reject) => {
                            this._server.closeAllConnections();
                            this._server.close((err) => {
                                if (err != null) {
                                    reject(err);
                                }
                                else {
                                    resolve();
                                }
                            });
                        });
                        await this._logger.logInfo("STOPPED HEALTH CHECK SERVER ON PORT 8080");
                    }
                    catch (error) {
                        await this._logger.logWarning("ERROR STOPPING HEALTH CHECK SERVER ON PORT 8080");
                        await this._logger.logError(error);
                    }
                }
            },
            () => this._cleanUp()
        ]);
        // process.on("SIGTERM", () =>
        // {
        //     this._shutDown("SIGTERM").catch(e => console.error(e));
        // });
        // process.on("SIGINT", () =>
        // {
        //     this._shutDown("SIGINT").catch(e => console.error(e));
        // });
    }
    // private async _shutDown(signal: string): Promise<void>
    // {
    //     console.warn(`SIGNAL RECEIVED (${signal})`);
    //     if (this._shutdownPromise == null)
    //         this._shutdownPromise = this._actuallyShutdown(signal);
    //     return this._shutdownPromise;
    // }
    // private async _actuallyShutdown(signal: string): Promise<void>
    // {
    //     console.warn(`SERVICE STOPPING (${signal})`);
    //     if (this._isShutDown)
    //         return;
    //     this._isShutDown = true;
    //     await this._program.stop();
    //     await this._cleanUp();
    //     console.warn(`SERVICE STOPPED (${signal})`);
    //     process.exit(0);
    // }
    async _cleanUp() {
        if (this._isCleanUp)
            return;
        this._isCleanUp = true;
        await this._logger.logInfo("DISPOSE ACTIONS EXECUTING...");
        try {
            await Promise.allSettled(this._disposeActions.map(t => t()));
            await this._logger.logInfo("DISPOSE ACTIONS COMPLETE");
        }
        catch (error) {
            await this._logger.logWarning("DISPOSE ACTIONS ERROR");
            await this._logger.logError(error);
        }
    }
}
//# sourceMappingURL=svc-app.js.map