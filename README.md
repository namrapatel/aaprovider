# aaprovider
`aaprovider` is an [ethers.js](https://github.com/ethers-io/ethers.js) provider that supports sending `UserOperations` as defined in the [Account Abstraction specification](https://github.com/ethereum/EIPs/blob/3fd65b1a782912bfc18cb975c62c55f733c7c96e/EIPS/eip-4337.md). 

This provider is implemented by extending the `JsonRpcProvider` from the main ethers.js library and adding a new method `sendUserOperation` that will send the params the user enters to the `eth_sendUserOperation`  RPC method.

## Installation

TODO.

## Usage

TODO.
