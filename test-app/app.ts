import { inject } from "@nivinjoseph/n-ject";
import { Logger } from "@nivinjoseph/n-log";
import { given } from "@nivinjoseph/n-defensive";
import { Program } from "../src/index.js";
import { Delay } from "@nivinjoseph/n-util";
import { SocketChannelSubscription, SocketClient } from "@nivinjoseph/n-sock/client";


@inject("Logger", "SocketClient")
export class App implements Program
{
    private readonly _logger: Logger;
    private readonly _socketClient: SocketClient;
    private _stopRequested: boolean;
    private _shouldExit = false;
    private _sub: SocketChannelSubscription | null = null; 


    public constructor(logger: Logger, socketClient: SocketClient)
    {
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;

        given(socketClient, "socketClient").ensureHasValue().ensureIsObject();
        this._socketClient = socketClient;

        this._stopRequested = false;
    }


    public async start(): Promise<void>
    {
        let index = 1;

        this._sub = await this._socketClient.subscribe("todo", "TodoCreated");
        
        this._sub.onData((data) =>
        {
            index++;
            
            console.log("data", data);
            
            if (index > 3)
                this._shouldExit = true;
        });

        while (!this._shouldExit && !this._stopRequested)
        {
            await this._logger.logInfo(`${index} I am running...`);
            await Delay.seconds(1);
        }
    }

    public async stop(): Promise<void>
    {
        this._stopRequested = true;

        await this._logger.logInfo("I am stopping...");
        
        this._sub?.unsubscribe();

        await Delay.seconds(2);
    }
}