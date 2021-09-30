import { BigNumberish } from "@ethersproject/bignumber";
import { BytesLike } from "@ethersproject/bytes";
export declare type UserOperation = {
    sender?: string;
    nonce?: BigNumberish;
    initCode?: BytesLike;
    callData?: BytesLike;
    callGas?: BigNumberish;
    verificationGas?: BigNumberish;
    preVerificationGas?: BigNumberish;
    paymaster?: string;
    paymasterData?: BytesLike;
    signature?: BytesLike;
    maxPriorityFeePerGas?: BigNumberish;
    maxFeePerGas?: BigNumberish;
};
