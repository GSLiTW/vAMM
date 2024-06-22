# A PoC vAMM similar to Perpetual Protocol V1

Run the following script to run the tests.

Some of the implementation may be simpler to save gas, e.g., some amount calculation done off-chain. But the implementation is there for better code readibility.

```shell
npm install
npx hardhat test
```

or

```shell
REPORT_GAS=true npx hardhat test
```
