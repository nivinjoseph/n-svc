import { ConfigurationManager } from "@nivinjoseph/n-config";
import { given } from "@nivinjoseph/n-defensive";
import { InvalidOperationException } from "@nivinjoseph/n-exception";
import { ComponentInstaller, Container, Registry } from "@nivinjoseph/n-ject";
import { ConsoleLogger, Logger } from "@nivinjoseph/n-log";
import { Program } from "./program.js";
import { ShutdownManager } from "./shutdown-manager.js";
import * as http from "node:http";


// public
export class SvcApp
{
    private readonly _container: Container;
    private readonly _ownsContainer: boolean;
    private readonly _programKey = "$program";
    private _logger!: Logger;
    private _programRegistered = false;
    private readonly _disposeActions = new Array<() => Promise<void>>();
    private _isBootstrapped = false;
    private _serverPort = 8080;
    private _server!: http.Server;
    private _program!: Program;
    // private _isShutDown = false;
    private _isCleanUp = false;
    // private _shutdownPromise: Promise<void> | null = null;
    private _shutdownManager!: ShutdownManager;


    public get containerRegistry(): Registry { return this._container; }


    public constructor(container?: Container)
    {
        given(container as Container, "container").ensureIsObject().ensureIsType(Container);
        if (container == null)
        {
            this._container = new Container();
            this._ownsContainer = true;
        }
        else
        {
            this._container = container;
            this._ownsContainer = false;
        }
    }


    public useLogger(logger: Logger): this
    {
        if (this._isBootstrapped)
            throw new InvalidOperationException("useLogger");

        given(logger, "logger").ensureHasValue().ensureIsObject();

        this._logger = logger;
        return this;
    }

    public useInstaller(installer: ComponentInstaller): this
    {
        if (this._isBootstrapped)
            throw new InvalidOperationException("useInstaller");

        given(installer, "installer").ensureHasValue();
        this._container.install(installer);
        return this;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    public registerProgram(programClass: Function): this
    {
        if (this._isBootstrapped || this._programRegistered)
            throw new InvalidOperationException("registerProgram");

        given(programClass, "programClass").ensureHasValue().ensureIsFunction();
        this._container.registerSingleton(this._programKey, programClass);
        this._programRegistered = true;
        return this;
    }

    public registerDisposeAction(disposeAction: () => Promise<void>): this
    {
        if (this._isBootstrapped)
            throw new InvalidOperationException("registerForDispose");

        given(disposeAction, "disposeAction").ensureHasValue().ensureIsFunction();

        this._disposeActions.push(() =>
        {
            return new Promise((resolve) =>
            {
                try
                {
                    disposeAction()
                        .then(() => resolve())
                        .catch((e) =>
                        {
                            // eslint-disable-next-line @typescript-eslint/no-floating-promises
                            this._logger.logError(e)
                                .finally(() => resolve());
                            // resolve();
                            // // tslint:disable-next-line
                            // this._logger.logError(e).then(() => resolve());
                        });
                }
                catch (error)
                {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    this._logger.logError(error as any).finally(() => resolve());
                    // resolve();
                    // // tslint:disable-next-line
                    // this._logger.logError(error).then(() => resolve());
                }
            });
        });
        return this;
    }

    public useHealthCheckServerPort(port: number): this
    {
        if (this._isBootstrapped)
            throw new InvalidOperationException("useHealthCheckServerPort");

        given(port, "port").ensureHasValue().ensureIsNumber();
        this._serverPort = port;

        return this;
    }

    public bootstrap(): void
    {
        if (this._isBootstrapped || !this._programRegistered)
            throw new InvalidOperationException("bootstrap");

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!this._logger)
            this._logger = new ConsoleLogger({
                useJsonFormat: ConfigurationManager.getConfig<string>("env") !== "dev"
            });

        this._configureContainer();

        this._configureStartup()
            .then(async () =>
            {
                const appEnv = ConfigurationManager.getConfig<string>("env");
                const appName = ConfigurationManager.getConfig<string>("package.name");
                const appVersion = ConfigurationManager.getConfig<string>("package.version");
                const appDescription = ConfigurationManager.getConfig<string>("package.description");

                await this._logger.logInfo(`ENV: ${appEnv}; NAME: ${appName}; VERSION: ${appVersion}; DESCRIPTION: ${appDescription}.`);

                this._configureShutDown();

                const p = this._program.start();
                this._isBootstrapped = true;
                await this._logger.logInfo("SERVICE STARTED");
                await p;
            })
            .then(async () =>
            {
                if (!this._shutdownManager.isShutdown)
                    await this._cleanUp();
            })
            .then(async () =>
            {
                if (!this._shutdownManager.isShutdown)
                    await this._logger.logInfo(`SERVICE COMPLETE`);
            })
            .catch(async (err) =>
            {
                await this._logger.logWarning(`SERVICE ERROR`);
                await this._logger.logError(err);
                process.exit(1);
            });
    }

    private _configureContainer(): void
    {
        if (this._ownsContainer)
            this._container.bootstrap();

        this.registerDisposeAction(() => this._container.dispose());
    }

    private async _configureStartup(): Promise<void>
    {
        await this._logger.logInfo(`SERVICE STARTING...`);

        try
        {
            const server = http.createServer((req, res) =>
            {
                if (req.url === "/healthCheck")
                {
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "text/plain");
                    res.end("AVAILABLE");
                }
                else
                {
                    res.statusCode = 404;
                    res.setHeader("Content-Type", "text/plain");
                    res.end("NOT FOUND");
                }
            });

            await new Promise<void>((resolve, _reject) =>
            {
                server.listen(this._serverPort, () =>
                {
                    resolve();
                });

                this._server = server;
            });

            await this._logger.logInfo(`STARTED HEALTH CHECK SERVER ON PORT ${this._serverPort}`);
        }
        catch (error)
        {
            await this._logger.logInfo(`ERROR STARTING HEALTH CHECK SERVER ON PORT ${this._serverPort}`);
            throw error;
        }

        this._program = this._container.resolve<Program>(this._programKey);
    }

    private _configureShutDown(): void
    {
        this.registerDisposeAction(async () =>
        {
            await this._logger.logInfo("CLEANING UP. PLEASE WAIT...");
            // return Delay.seconds(ConfigurationManager.getConfig<string>("env") === "dev" ? 2 : 20);
        });


        this._shutdownManager = new ShutdownManager(this._logger, [
            async (): Promise<void> =>
            {
                try
                {
                    await this._logger.logInfo("STOPPING PROGRAM...");
                    await this._program.stop();
                    await this._logger.logInfo("PROGRAM STOPPED");
                }
                catch (error)
                {
                    await this._logger.logWarning("ERROR STOPPING PROGRAM");
                    await this._logger.logError(error as any);
                }
                finally
                {
                    try
                    {
                        await new Promise<void>((resolve, reject) =>
                        {
                            this._server.closeAllConnections();
                            this._server.close((err): void =>
                            {
                                if (err != null)
                                {
                                    reject(err);
                                }
                                else
                                {
                                    resolve();
                                }
                            });
                        });

                        await this._logger.logInfo("STOPPED HEALTH CHECK SERVER ON PORT 8080");
                    }
                    catch (error)
                    {
                        await this._logger.logWarning("ERROR STOPPING HEALTH CHECK SERVER ON PORT 8080");
                        await this._logger.logError(error as any);
                    }
                }
            },
            (): Promise<any> => this._cleanUp()
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

    private async _cleanUp(): Promise<void>
    {
        if (this._isCleanUp)
            return;

        this._isCleanUp = true;

        await this._logger.logInfo("DISPOSE ACTIONS EXECUTING...");
        try
        {
            await Promise.allSettled(this._disposeActions.map(t => t()));
            await this._logger.logInfo("DISPOSE ACTIONS COMPLETE");
        }
        catch (error)
        {
            await this._logger.logWarning("DISPOSE ACTIONS ERROR");
            await this._logger.logError(error as any);
        }
    }
}