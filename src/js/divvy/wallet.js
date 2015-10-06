var sjcl = require('./utils').sjcl;

var WalletGenerator = require('divvy-wallet-generator')({
  sjcl: sjcl
});

module.exports = WalletGenerator;

