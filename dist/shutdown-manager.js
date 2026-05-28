import { given } from "@nivinjoseph/n-defensive";
export class ShutdownManager {
    _logger;
    _cleanup;
    _isShutDown = false;
    _shutdownPromise = null;
    get isShutdown() { return this._isShutDown; }
    constructor(logger, cleanup) {
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
        given(cleanup, "cleanup").ensureHasValue().ensureIsArray().ensureIsNotEmpty();
        this._cleanup = cleanup;
        process
            .on("SIGINT", () => {
            this._initiateShutdown("SIGINT").catch(e => this._logger.logError(e));
        })
            .on("SIGTERM", () => {
            this._initiateShutdown("SIGTERM").catch(e => this._logger.logError(e));
        });
    }
    async _initiateShutdown(signal) {
        await this._logger.logWarning(`SIGNAL RECEIVED (${signal})`);
        if (this._shutdownPromise == null)
            this._shutdownPromise = this._actuallyShutdown(signal);
        await this._shutdownPromise;
    }
    async _actuallyShutdown(signal) {
        await this._logger.logWarning(`APPLICATION STOPPING (${signal})...`);
        if (this._isShutDown)
            return;
        this._isShutDown = true;
        await this._logger.logInfo("EXECUTING SHUTDOWN...");
        for (const action of this._cleanup) {
            try {
                await action();
            }
            catch (error) {
                await this._logger.logWarning("ERROR DURING SHUTDOWN");
                await this._logger.logError(error);
            }
        }
        await this._logger.logInfo("SHUTDOWN COMPLETE");
        await this._logger.logWarning(`APPLICATION STOPPED (${signal})`);
        process.exit(0);
    }
}
//# sourceMappingURL=shutdown-manager.js.map