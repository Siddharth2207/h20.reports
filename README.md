# Raindex OrderBook Depth Chart
## Developers Guide
To start, install deps by following command, you need nix pkg manager instaleed on your machine:
```sh
nix develop -c yarn install
```
or enter nix shell first
```sh
nix develop
```
and then run:
```sh
yarn install
```
---
To run the server locally:
```sh
nix develop -c yarn start
```
or enter nix shell first
```sh
nix develop
```
and then run:
```sh
yarn start
```
---
To build for production:
```sh
nix develop -c yarn build
```
or enter nix shell first
```sh
nix develop
```
and then run:
```sh
yarn build
```
---
To run the tests:
```sh
nix develop -c yarn test
```
or enter nix shell first
```sh
nix develop
```
and then run:
```sh
yarn test
```
---
To check lints:
```sh
nix develop -c yarn lint
```
or enter nix shell first
```sh
nix develop
```
and then run:
```sh
yarn lint
```
---
To fix lints:
```sh
nix develop -c yarn lint-fix
```
or enter nix shell first
```sh
nix develop
```
and then run:
```sh
yarn lint-fix
```
