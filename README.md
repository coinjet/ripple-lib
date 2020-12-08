# divvy-lib

A JavaScript API for interacting with Divvy in Node.js and the browser

[![Build Status](https://travis-ci.org/xdv/divvy-lib.svg?branch=master)](https://travis-ci.org/xdv/divvy-lib)
[![NPM](https://nodei.co/npm/divvy-lib.png)](https://www.npmjs.org/package/divvy-lib)

### Features

+ Connect to a divvyd server in JavaScript (Node.js or browser)
+ Issue [divvyd API](https://divvy.com/build/divvyd-apis/) requests
+ Listen to events on the Divvy network (transaction, ledger, etc.)
+ Sign and submit transactions to the Divvy network

### In this file

1. [Installation](#installation)
2. [Quick start](#quick-start)
3. [Running tests](#running-tests)

### Additional documentation

1. [Guides](docs/GUIDES.md)
2. [API Reference](docs/REFERENCE.md)
3. [Wiki](https://divvy.com/wiki/Divvy_JavaScript_library)

### Also see

+ [The Divvy wiki](https://divvy.com/wiki)
+ [divvy.com](https://divvy.com)

## Installation

**Via npm for Node.js**

```
  $ npm install divvy-lib
```

**Via bower (for browser use)**

```
  $ bower install divvy
```

See the [bower-divvy repo](https://github.com/divvy/bower-divvy) for additional bower instructions


**Building divvy-lib for browser environments**

divvy-lib uses Gulp to generate browser builds. These steps will generate minified and non-minified builds of divvy-lib in the `build/` directory.

```
  $ git clone https://github.com/divvy/divvy-lib
  $ npm install
  $ npm run build
```

**Restricted browser builds**

You may generate browser builds that contain a subset of features. To do this, run `./node_modules/.bin/gulp build-<name>`

+ `build-core` Contains the functionality to make requests and listen for events such as `ledgerClose`. Only `divvy.Remote` is currently exposed. Advanced features like transaction submission and orderbook tracking are excluded from this build.

## Quick start

`Remote.js` ([remote.js](https://github.com/divvy/divvy-lib/blob/develop/src/js/divvy/remote.js)) is the point of entry for interacting with divvyd

```js
/* Loading divvy-lib with Node.js */
var Remote = require('divvy-lib').Remote;

/* Loading divvy-lib in a webpage */
// var Remote = divvy.Remote;

var remote = new Remote({
  // see the API Reference for available options
  servers: [ 'wss://s1.divvy.com:443' ]
});

remote.connect(function() {
  /* remote connected */
  remote.requestServerInfo(function(err, info) {
    // process err and info
  });
});
```

## Running tests

1. Clone the repository

2. `cd` into the repository and install dependencies with `npm install`

3. `npm test`

**Generating code coverage**

divvy-lib uses `istanbul` to generate code coverage. To create a code coverage report, run `npm test --coverage`. The report will be created in `coverage/lcov-report/`.
