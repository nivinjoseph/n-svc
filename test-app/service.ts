import { ComponentInstaller, Registry } from "@nivinjoseph/n-ject";
import { given } from "@nivinjoseph/n-defensive";
import { App } from "./app.js";
import { ConsoleLogger, LogDateTimeZone } from "@nivinjoseph/n-log";
import { SvcApp } from "../src/index.js";
import { SocketClient } from "@nivinjoseph/n-sock/client";


const logger = new ConsoleLogger({ logDateTimeZone: LogDateTimeZone.est });

class Installer implements ComponentInstaller
{
    public install(registry: Registry): void
    {
        given(registry, "registry").ensureHasValue().ensureIsObject();

        registry.registerInstance("Logger", logger)
            .registerInstance("SocketClient", new SocketClient("http://localhost:3000"));
    }
}


const service = new SvcApp();

service
    .useLogger(logger)
    .useInstaller(new Installer())
    .registerProgram(App)
    .bootstrap();