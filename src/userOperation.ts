"use strict";

import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { BytesLike, isHexString } from "@ethersproject/bytes";
import { AccessListish, Transaction } from "@ethersproject/transactions";

///////////////////////////////
// Exported Type

export type UserOperation = {
    sender?: string,
    nonce?: BigNumberish,
    initCode?: BytesLike,
    callData?: BytesLike,
    callGas?: BigNumberish,
    verificationGas?: BigNumberish,
    preVerificationGas?: BigNumberish,
    paymaster?: string,
    paymasterData?: BytesLike,
    signature?: BytesLike,
    maxPriorityFeePerGas?: BigNumberish,
    maxFeePerGas?: BigNumberish;
}