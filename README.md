# A PoC vAMM similar to Perpetual Protocol V1

Some of the implementation may be simpler to save gas, e.g., some amount calculation done off-chain. But the implementation is there for better code readibility.

## Run the following script to run the tests

```shell
npm install
npx hardhat test
```

## If you would like to see the gas report

```shell
REPORT_GAS=true npx hardhat test
```

## If you would like to only run some specific tests

1. To run all the tests in a specific file

```shell
npx hardhat test <path_to_the_test_file>
```

2. To run only a specific unit test

Add ```.only``` after the ```it``` of your specific choice in the test file

For example:

```typescript
it.only("Should open a long position correctly", async function () {
    // the test code
});
```
