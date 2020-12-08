var sjcl = require('./utils').sjcl;

var WalletGenerator = require('divvy-wallet')({
  sjcl: sjcl
});

module.exports = WalletGenerator;

