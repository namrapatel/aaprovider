"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonRpcProvider = exports.AASigner = void 0;
const abstract_signer_1 = require("@ethersproject/abstract-signer");
const bignumber_1 = require("@ethersproject/bignumber");
const bytes_1 = require("@ethersproject/bytes");
const hash_1 = require("@ethersproject/hash");
const properties_1 = require("@ethersproject/properties");
const strings_1 = require("@ethersproject/strings");
const transactions_1 = require("@ethersproject/transactions");
const web_1 = require("@ethersproject/web");
const logger_1 = require("@ethersproject/logger");
const _version_1 = require("@ethersproject/providers/src.ts/_version");
const logger = new logger_1.Logger(_version_1.version);
const base_provider_1 = require("@ethersproject/providers/src.ts/base-provider");
const errorGas = ["call", "estimateGas"];
function checkError(method, error, params) {
    // Undo the "convenience" some nodes are attempting to prevent backwards
    // incompatibility; maybe for v6 consider forwarding reverts as errors
    if (method === "call" && error.code === logger_1.Logger.errors.SERVER_ERROR) {
        const e = error.error;
        if (e && e.message.match("reverted") && (0, bytes_1.isHexString)(e.data)) {
            return e.data;
        }
        logger.throwError("missing revert data in call exception", logger_1.Logger.errors.CALL_EXCEPTION, {
            error, data: "0x"
        });
    }
    let message = error.message;
    if (error.code === logger_1.Logger.errors.SERVER_ERROR && error.error && typeof (error.error.message) === "string") {
        message = error.error.message;
    }
    else if (typeof (error.body) === "string") {
        message = error.body;
    }
    else if (typeof (error.responseText) === "string") {
        message = error.responseText;
    }
    message = (message || "").toLowerCase();
    const transaction = params.transaction || params.signedTransaction;
    // "insufficient funds for gas * price + value + cost(data)"
    if (message.match(/insufficient funds|base fee exceeds gas limit/)) {
        logger.throwError("insufficient funds for intrinsic transaction cost", logger_1.Logger.errors.INSUFFICIENT_FUNDS, {
            error, method, transaction
        });
    }
    // "nonce too low"
    if (message.match(/nonce too low/)) {
        logger.throwError("nonce has already been used", logger_1.Logger.errors.NONCE_EXPIRED, {
            error, method, transaction
        });
    }
    // "replacement transaction underpriced"
    if (message.match(/replacement transaction underpriced/)) {
        logger.throwError("replacement fee too low", logger_1.Logger.errors.REPLACEMENT_UNDERPRICED, {
            error, method, transaction
        });
    }
    // "replacement transaction underpriced"
    if (message.match(/only replay-protected/)) {
        logger.throwError("legacy pre-eip-155 transactions not supported", logger_1.Logger.errors.UNSUPPORTED_OPERATION, {
            error, method, transaction
        });
    }
    if (errorGas.indexOf(method) >= 0 && message.match(/gas required exceeds allowance|always failing transaction|execution reverted/)) {
        logger.throwError("cannot estimate gas; transaction may fail or may require manual gas limit", logger_1.Logger.errors.UNPREDICTABLE_GAS_LIMIT, {
            error, method, transaction
        });
    }
    throw error;
}
function timer(timeout) {
    return new Promise(function (resolve) {
        setTimeout(resolve, timeout);
    });
}
function getResult(payload) {
    if (payload.error) {
        // @TODO: not any
        const error = new Error(payload.error.message);
        error.code = payload.error.code;
        error.data = payload.error.data;
        throw error;
    }
    return payload.result;
}
function getLowerCase(value) {
    if (value) {
        return value.toLowerCase();
    }
    return value;
}
const _constructorGuard = {};
class AASigner extends abstract_signer_1.Signer {
    constructor(constructorGuard, provider, addressOrIndex) {
        logger.checkNew(new.target, AASigner);
        super();
        if (constructorGuard !== _constructorGuard) {
            throw new Error("do not call the JsonRpcSigner constructor directly; use provider.getSigner");
        }
        (0, properties_1.defineReadOnly)(this, "provider", provider);
        if (addressOrIndex == null) {
            addressOrIndex = 0;
        }
        if (typeof (addressOrIndex) === "string") {
            (0, properties_1.defineReadOnly)(this, "_address", this.provider.formatter.address(addressOrIndex));
            (0, properties_1.defineReadOnly)(this, "_index", null);
        }
        else if (typeof (addressOrIndex) === "number") {
            (0, properties_1.defineReadOnly)(this, "_index", addressOrIndex);
            (0, properties_1.defineReadOnly)(this, "_address", null);
        }
        else {
            logger.throwArgumentError("invalid address or index", "addressOrIndex", addressOrIndex);
        }
    }
    connect(provider) {
        return logger.throwError("cannot alter JSON-RPC Signer connection", logger_1.Logger.errors.UNSUPPORTED_OPERATION, {
            operation: "connect"
        });
    }
    connectUnchecked() {
        return new UncheckedJsonRpcSigner(_constructorGuard, this.provider, this._address || this._index);
    }
    getAddress() {
        if (this._address) {
            return Promise.resolve(this._address);
        }
        return this.provider.send("eth_accounts", []).then((accounts) => {
            if (accounts.length <= this._index) {
                logger.throwError("unknown account #" + this._index, logger_1.Logger.errors.UNSUPPORTED_OPERATION, {
                    operation: "getAddress"
                });
            }
            return this.provider.formatter.address(accounts[this._index]);
        });
    }
    sendUncheckedTransaction(transaction) {
        transaction = (0, properties_1.shallowCopy)(transaction);
        const fromAddress = this.getAddress().then((address) => {
            if (address) {
                address = address.toLowerCase();
            }
            return address;
        });
        // The JSON-RPC for eth_sendTransaction uses 90000 gas; if the user
        // wishes to use this, it is easy to specify explicitly, otherwise
        // we look it up for them.
        if (transaction.gasLimit == null) {
            const estimate = (0, properties_1.shallowCopy)(transaction);
            estimate.from = fromAddress;
            transaction.gasLimit = this.provider.estimateGas(estimate);
        }
        if (transaction.to != null) {
            transaction.to = Promise.resolve(transaction.to).then(async (to) => {
                if (to == null) {
                    return null;
                }
                const address = await this.provider.resolveName(to);
                if (address == null) {
                    logger.throwArgumentError("provided ENS name resolves to null", "tx.to", to);
                }
                return address;
            });
        }
        return (0, properties_1.resolveProperties)({
            tx: (0, properties_1.resolveProperties)(transaction),
            sender: fromAddress
        }).then(({ tx, sender }) => {
            if (tx.from != null) {
                if (tx.from.toLowerCase() !== sender) {
                    logger.throwArgumentError("from address mismatch", "transaction", transaction);
                }
            }
            else {
                tx.from = sender;
            }
            const hexTx = this.provider.constructor.hexlifyTransaction(tx, { from: true });
            return this.provider.send("eth_sendTransaction", [hexTx]).then((hash) => {
                return hash;
            }, (error) => {
                return checkError("sendTransaction", error, hexTx);
            });
        });
    }
    signTransaction(transaction) {
        return logger.throwError("signing transactions is unsupported", logger_1.Logger.errors.UNSUPPORTED_OPERATION, {
            operation: "signTransaction"
        });
    }
    async sendTransaction(transaction) {
        // This cannot be mined any earlier than any recent block
        const blockNumber = await this.provider._getInternalBlockNumber(100 + 2 * this.provider.pollingInterval);
        // Send the transaction
        const hash = await this.sendUncheckedTransaction(transaction);
        try {
            // Unfortunately, JSON-RPC only provides and opaque transaction hash
            // for a response, and we need the actual transaction, so we poll
            // for it; it should show up very quickly
            return await (0, web_1.poll)(async () => {
                const tx = await this.provider.getTransaction(hash);
                if (tx === null) {
                    return undefined;
                }
                return this.provider._wrapTransaction(tx, hash, blockNumber);
            }, { oncePoll: this.provider });
        }
        catch (error) {
            error.transactionHash = hash;
            throw error;
        }
    }
    async sendUserOperation(transaction) {
        // TODO: checkTransaction()
        // TODO: check the perform() method in base-provider
        // TODO: gasLimit issue: ethers will do an incorrect gas estimation on contract call unless a gasLimit is given 
        const tx = await (0, properties_1.resolveProperties)(transaction);
        // transaction = shallowCopy(transaction);
        const hexUserOp = this.provider.constructor.hexlifyUserOperation(tx);
        return this.provider.send("eth_sendUserOperation", [hexUserOp]).then((hash) => {
            return hash;
        }, (error) => {
            return checkError("sendTransaction", error, hexUserOp); // do I change this to "sendUserOperation"?
        });
    }
    async signMessage(message) {
        const data = ((typeof (message) === "string") ? (0, strings_1.toUtf8Bytes)(message) : message);
        const address = await this.getAddress();
        // https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_sign
        return await this.provider.send("eth_sign", [address.toLowerCase(), (0, bytes_1.hexlify)(data)]);
    }
    async _signTypedData(domain, types, value) {
        // Populate any ENS names (in-place)
        const populated = await hash_1._TypedDataEncoder.resolveNames(domain, types, value, (name) => {
            return this.provider.resolveName(name);
        });
        const address = await this.getAddress();
        return await this.provider.send("eth_signTypedData_v4", [
            address.toLowerCase(),
            JSON.stringify(hash_1._TypedDataEncoder.getPayload(populated.domain, types, populated.value))
        ]);
    }
    async unlock(password) {
        const provider = this.provider;
        const address = await this.getAddress();
        return provider.send("personal_unlockAccount", [address.toLowerCase(), password, null]);
    }
}
exports.AASigner = AASigner;
class UncheckedJsonRpcSigner extends AASigner {
    sendTransaction(transaction) {
        return this.sendUncheckedTransaction(transaction).then((hash) => {
            return {
                hash: hash,
                nonce: null,
                gasLimit: null,
                gasPrice: null,
                data: null,
                value: null,
                chainId: null,
                confirmations: 0,
                from: null,
                wait: (confirmations) => { return this.provider.waitForTransaction(hash, confirmations); }
            };
        });
    }
}
const allowedTransactionKeys = {
    chainId: true, data: true, gasLimit: true, gasPrice: true, nonce: true, to: true, value: true,
    type: true, accessList: true,
    maxFeePerGas: true, maxPriorityFeePerGas: true
};
class JsonRpcProvider extends base_provider_1.BaseProvider {
    constructor(url, network) {
        logger.checkNew(new.target, JsonRpcProvider);
        let networkOrReady = network;
        // The network is unknown, query the JSON-RPC for it
        if (networkOrReady == null) {
            networkOrReady = new Promise((resolve, reject) => {
                setTimeout(() => {
                    this.detectNetwork().then((network) => {
                        resolve(network);
                    }, (error) => {
                        reject(error);
                    });
                }, 0);
            });
        }
        super(networkOrReady);
        // Default URL
        if (!url) {
            url = (0, properties_1.getStatic)(this.constructor, "defaultUrl")();
        }
        if (typeof (url) === "string") {
            (0, properties_1.defineReadOnly)(this, "connection", Object.freeze({
                url: url
            }));
        }
        else {
            (0, properties_1.defineReadOnly)(this, "connection", Object.freeze((0, properties_1.shallowCopy)(url)));
        }
        this._nextId = 42;
    }
    get _cache() {
        if (this._eventLoopCache == null) {
            this._eventLoopCache = {};
        }
        return this._eventLoopCache;
    }
    static defaultUrl() {
        return "http:/\/localhost:8545";
    }
    detectNetwork() {
        if (!this._cache["detectNetwork"]) {
            this._cache["detectNetwork"] = this._uncachedDetectNetwork();
            // Clear this cache at the beginning of the next event loop
            setTimeout(() => {
                this._cache["detectNetwork"] = null;
            }, 0);
        }
        return this._cache["detectNetwork"];
    }
    async _uncachedDetectNetwork() {
        await timer(0);
        let chainId = null;
        try {
            chainId = await this.send("eth_chainId", []);
        }
        catch (error) {
            try {
                chainId = await this.send("net_version", []);
            }
            catch (error) { }
        }
        if (chainId != null) {
            const getNetwork = (0, properties_1.getStatic)(this.constructor, "getNetwork");
            try {
                return getNetwork(bignumber_1.BigNumber.from(chainId).toNumber());
            }
            catch (error) {
                return logger.throwError("could not detect network", logger_1.Logger.errors.NETWORK_ERROR, {
                    chainId: chainId,
                    event: "invalidNetwork",
                    serverError: error
                });
            }
        }
        return logger.throwError("could not detect network", logger_1.Logger.errors.NETWORK_ERROR, {
            event: "noNetwork"
        });
    }
    getSigner(addressOrIndex) {
        return new AASigner(_constructorGuard, this, addressOrIndex);
    }
    getUncheckedSigner(addressOrIndex) {
        return this.getSigner(addressOrIndex).connectUnchecked();
    }
    listAccounts() {
        return this.send("eth_accounts", []).then((accounts) => {
            return accounts.map((a) => this.formatter.address(a));
        });
    }
    send(method, params) {
        const request = {
            method: method,
            params: params,
            id: (this._nextId++),
            jsonrpc: "2.0"
        };
        this.emit("debug", {
            action: "request",
            request: (0, properties_1.deepCopy)(request),
            provider: this
        });
        // We can expand this in the future to any call, but for now these
        // are the biggest wins and do not require any serializing parameters.
        const cache = (["eth_chainId", "eth_blockNumber"].indexOf(method) >= 0);
        if (cache && this._cache[method]) {
            return this._cache[method];
        }
        const result = (0, web_1.fetchJson)(this.connection, JSON.stringify(request), getResult).then((result) => {
            this.emit("debug", {
                action: "response",
                request: request,
                response: result,
                provider: this
            });
            return result;
        }, (error) => {
            this.emit("debug", {
                action: "response",
                error: error,
                request: request,
                provider: this
            });
            throw error;
        });
        // Cache the fetch, but clear it on the next event loop
        if (cache) {
            this._cache[method] = result;
            setTimeout(() => {
                this._cache[method] = null;
            }, 0);
        }
        return result;
    }
    prepareRequest(method, params) {
        switch (method) {
            case "getBlockNumber":
                return ["eth_blockNumber", []];
            case "getGasPrice":
                return ["eth_gasPrice", []];
            case "getBalance":
                return ["eth_getBalance", [getLowerCase(params.address), params.blockTag]];
            case "getTransactionCount":
                return ["eth_getTransactionCount", [getLowerCase(params.address), params.blockTag]];
            case "getCode":
                return ["eth_getCode", [getLowerCase(params.address), params.blockTag]];
            case "getStorageAt":
                return ["eth_getStorageAt", [getLowerCase(params.address), params.position, params.blockTag]];
            case "sendTransaction":
                return ["eth_sendRawTransaction", [params.signedTransaction]];
            case "getBlock":
                if (params.blockTag) {
                    return ["eth_getBlockByNumber", [params.blockTag, !!params.includeTransactions]];
                }
                else if (params.blockHash) {
                    return ["eth_getBlockByHash", [params.blockHash, !!params.includeTransactions]];
                }
                return null;
            case "getTransaction":
                return ["eth_getTransactionByHash", [params.transactionHash]];
            case "getTransactionReceipt":
                return ["eth_getTransactionReceipt", [params.transactionHash]];
            case "call": {
                const hexlifyTransaction = (0, properties_1.getStatic)(this.constructor, "hexlifyTransaction");
                return ["eth_call", [hexlifyTransaction(params.transaction, { from: true }), params.blockTag]];
            }
            case "estimateGas": {
                const hexlifyTransaction = (0, properties_1.getStatic)(this.constructor, "hexlifyTransaction");
                return ["eth_estimateGas", [hexlifyTransaction(params.transaction, { from: true })]];
            }
            case "getLogs":
                if (params.filter && params.filter.address != null) {
                    params.filter.address = getLowerCase(params.filter.address);
                }
                return ["eth_getLogs", [params.filter]];
            default:
                break;
        }
        return null;
    }
    async perform(method, params) {
        // Legacy networks do not like the type field being passed along (which
        // is fair), so we delete type if it is 0 and a non-EIP-1559 network
        if (method === "call" || method === "estimateGas") {
            const tx = params.transaction;
            if (tx && tx.type != null && bignumber_1.BigNumber.from(tx.type).isZero()) {
                // If there are no EIP-1559 properties, it might be non-EIP-a559
                if (tx.maxFeePerGas == null && tx.maxPriorityFeePerGas == null) {
                    const feeData = await this.getFeeData();
                    if (feeData.maxFeePerGas == null && feeData.maxPriorityFeePerGas == null) {
                        // Network doesn't know about EIP-1559 (and hence type)
                        params = (0, properties_1.shallowCopy)(params);
                        params.transaction = (0, properties_1.shallowCopy)(tx);
                        delete params.transaction.type;
                    }
                }
            }
        }
        const args = this.prepareRequest(method, params);
        if (args == null) {
            logger.throwError(method + " not implemented", logger_1.Logger.errors.NOT_IMPLEMENTED, { operation: method });
        }
        try {
            return await this.send(args[0], args[1]);
        }
        catch (error) {
            return checkError(method, error, params);
        }
    }
    _startEvent(event) {
        if (event.tag === "pending") {
            this._startPending();
        }
        super._startEvent(event);
    }
    _startPending() {
        if (this._pendingFilter != null) {
            return;
        }
        const self = this;
        const pendingFilter = this.send("eth_newPendingTransactionFilter", []);
        this._pendingFilter = pendingFilter;
        pendingFilter.then(function (filterId) {
            function poll() {
                self.send("eth_getFilterChanges", [filterId]).then(function (hashes) {
                    if (self._pendingFilter != pendingFilter) {
                        return null;
                    }
                    let seq = Promise.resolve();
                    hashes.forEach(function (hash) {
                        // @TODO: This should be garbage collected at some point... How? When?
                        self._emitted["t:" + hash.toLowerCase()] = "pending";
                        seq = seq.then(function () {
                            return self.getTransaction(hash).then(function (tx) {
                                self.emit("pending", tx);
                                return null;
                            });
                        });
                    });
                    return seq.then(function () {
                        return timer(1000);
                    });
                }).then(function () {
                    if (self._pendingFilter != pendingFilter) {
                        self.send("eth_uninstallFilter", [filterId]);
                        return;
                    }
                    setTimeout(function () { poll(); }, 0);
                    return null;
                }).catch((error) => { });
            }
            poll();
            return filterId;
        }).catch((error) => { });
    }
    _stopEvent(event) {
        if (event.tag === "pending" && this.listenerCount("pending") === 0) {
            this._pendingFilter = null;
        }
        super._stopEvent(event);
    }
    // Convert an ethers.js transaction into a JSON-RPC transaction
    //  - gasLimit => gas
    //  - All values hexlified
    //  - All numeric values zero-striped
    //  - All addresses are lowercased
    // NOTE: This allows a TransactionRequest, but all values should be resolved
    //       before this is called
    // @TODO: This will likely be removed in future versions and prepareRequest
    //        will be the preferred method for this.
    static hexlifyTransaction(transaction, allowExtra) {
        // Check only allowed properties are given
        const allowed = (0, properties_1.shallowCopy)(allowedTransactionKeys);
        if (allowExtra) {
            for (const key in allowExtra) {
                if (allowExtra[key]) {
                    allowed[key] = true;
                }
            }
        }
        (0, properties_1.checkProperties)(transaction, allowed);
        const result = {};
        // Some nodes (INFURA ropsten; INFURA mainnet is fine) do not like leading zeros.
        ["gasLimit", "gasPrice", "type", "maxFeePerGas", "maxPriorityFeePerGas", "nonce", "value"].forEach(function (key) {
            if (transaction[key] == null) {
                return;
            }
            const value = (0, bytes_1.hexValue)(transaction[key]);
            if (key === "gasLimit") {
                key = "gas";
            }
            result[key] = value;
        });
        ["from", "to", "data"].forEach(function (key) {
            if (transaction[key] == null) {
                return;
            }
            result[key] = (0, bytes_1.hexlify)(transaction[key]);
        });
        if (transaction.accessList) {
            result["accessList"] = (0, transactions_1.accessListify)(transaction.accessList);
        }
        return result;
    }
    // Convert an ethers.js UserOp into a JSON-RPC compatible UserOperation
    //  - All values hexlified
    //  - All numeric values zero-striped
    //  - All addresses are lowercased
    static hexlifyUserOperation(transaction, allowExtra) {
        // Check only allowed properties are given
        const allowed = (0, properties_1.shallowCopy)(allowedTransactionKeys);
        if (allowExtra) {
            for (const key in allowExtra) {
                if (allowExtra[key]) {
                    allowed[key] = true;
                }
            }
        }
        // checkProperties(transaction, allowed); 
        const result = {};
        // Some nodes (INFURA ropsten; INFURA mainnet is fine) do not like leading zeros.
        ["callGas", "vertificationGas", "preVerificationGaspe", "maxFeePerGas", "maxPriorityFeePerGas", "nonce", "initCode", "callData", "paymasterData", "signature"].forEach(function (key) {
            if (transaction[key] == null) {
                return;
            }
            const value = (0, bytes_1.hexValue)(transaction[key]);
            result[key] = value;
        });
        ["sender", "paymaster"].forEach(function (key) {
            if (transaction[key] == null) {
                return;
            }
            result[key] = (0, bytes_1.hexlify)(transaction[key]);
        });
        if (transaction.accessList) {
            result["accessList"] = (0, transactions_1.accessListify)(transaction.accessList);
        }
        return result;
    }
}
exports.JsonRpcProvider = JsonRpcProvider;
//# sourceMappingURL=index.js.map