'use strict';

var ws = require('ws');
var lodash = require('lodash');
var assert = require('assert-diff');
var sjcl = require('divvy-lib').sjcl;
var Remote = require('divvy-lib').Remote;
var SerializedObject = require('divvy-lib').SerializedObject;
var Transaction = require('divvy-lib').Transaction;
var TransactionManager = require('../src/js/divvy/transactionmanager')
.TransactionManager;

var LEDGER = require('./fixtures/transactionmanager').LEDGER;
var ACCOUNT = require('./fixtures/transactionmanager').ACCOUNT;
var ACCOUNT2 = require('./fixtures/transactionmanager').ACCOUNT2;
var SUBSCRIBE_RESPONSE = require('./fixtures/transactionmanager')
.SUBSCRIBE_RESPONSE;
var ACCOUNT_INFO_RESPONSE = require('./fixtures/transactionmanager')
.ACCOUNT_INFO_RESPONSE;
var TX_STREAM_TRANSACTION = require('./fixtures/transactionmanager')
.TX_STREAM_TRANSACTION;
var ACCOUNT_TX_TRANSACTION = require('./fixtures/transactionmanager')
.ACCOUNT_TX_TRANSACTION;
var ACCOUNT_TX_RESPONSE = require('./fixtures/transactionmanager')
.ACCOUNT_TX_RESPONSE;
var ACCOUNT_TX_ERROR = require('./fixtures/transactionmanager')
.ACCOUNT_TX_ERROR;
var SUBMIT_RESPONSE = require('./fixtures/transactionmanager')
.SUBMIT_RESPONSE;
var SUBMIT_TEC_RESPONSE = require('./fixtures/transactionmanager')
.SUBMIT_TEC_RESPONSE;
var SUBMIT_TER_RESPONSE = require('./fixtures/transactionmanager')
.SUBMIT_TER_RESPONSE;
var SUBMIT_TEF_RESPONSE = require('./fixtures/transactionmanager')
.SUBMIT_TEF_RESPONSE;
var SUBMIT_TEL_RESPONSE = require('./fixtures/transactionmanager')
.SUBMIT_TEL_RESPONSE;

describe('TransactionManager', function() {
  var divvyd;
  var divvydConnection;
  var remote;
  var account;
  var transactionManager;

  before(function() {
    sjcl.random.addEntropy(
      '3045022100A58B0460BC5092CB4F96155C19125A4E079C870663F1D5E8BBC9BD', 256);
  });

  beforeEach(function(done) {
    divvyd = new ws.Server({port: 5763});

    divvyd.on('connection', function(c) {
      var ledger = lodash.extend({}, LEDGER);
      c.sendJSON = function(v) {
        try {
          c.send(JSON.stringify(v));
        } catch (e) {
          // empty
        }
      };
      c.sendResponse = function(baseResponse, ext) {
        assert.strictEqual(typeof baseResponse, 'object');
        assert.strictEqual(baseResponse.type, 'response');
        c.sendJSON(lodash.extend(baseResponse, ext));
      };
      c.closeLedger = function() {
        c.sendJSON(lodash.extend(ledger, {
          ledger_index: ++ledger.ledger_index
        }));
      };
      c.on('message', function(m) {
        m = JSON.parse(m);
        divvyd.emit('request_' + m.command, m, c);
      });
      divvydConnection = c;
    });

    divvyd.on('request_subscribe', function(message, c) {
      if (lodash.isEqual(message.streams, ['ledger', 'server'])) {
        c.sendResponse(SUBSCRIBE_RESPONSE, {id: message.id});
      }
    });
    divvyd.on('request_account_info', function(message, c) {
      if (message.account === ACCOUNT.address) {
        c.sendResponse(ACCOUNT_INFO_RESPONSE, {id: message.id});
      }
    });

    remote = new Remote({servers: ['ws://localhost:5763']});
    remote.setSecret(ACCOUNT.address, ACCOUNT.secret);
    account = remote.account(ACCOUNT.address);
    transactionManager = account._transactionManager;

    remote.connect(function() {
      setTimeout(done, 10);
    });
  });

  afterEach(function(done) {
    remote.disconnect(function() {
      divvyd.close();
      setImmediate(done);
    });
  });

  it('Normalize transaction', function() {
    var t1 = TransactionManager.normalizeTransaction(TX_STREAM_TRANSACTION);
    var t2 = TransactionManager.normalizeTransaction(ACCOUNT_TX_TRANSACTION);

    [t1, t2].forEach(function(t) {
      assert(t.hasOwnProperty('metadata'));
      assert(t.hasOwnProperty('tx_json'));
      assert.strictEqual(t.validated, true);
      assert.strictEqual(t.ledger_index, 1);
      assert.strictEqual(t.engine_result, 'tesSUCCESS');
      assert.strictEqual(t.type, 'transaction');
      assert.strictEqual(t.tx_json.hash,
        '01D66ACBD00B2A8F5D66FC8F67AC879CAECF49BC94FB97CF24F66B8406F4C040');
    });
  });

  it('Handle received transaction', function(done) {
    var transaction = Transaction.from_json(TX_STREAM_TRANSACTION.transaction);

    transaction.once('success', function() {
      done();
    });

    transaction.addId(TX_STREAM_TRANSACTION.transaction.hash);
    transactionManager.getPending().push(transaction);
    divvydConnection.sendJSON(TX_STREAM_TRANSACTION);
  });
  it('Handle received transaction -- failed', function(done) {
    var transaction = Transaction.from_json(TX_STREAM_TRANSACTION.transaction);

    transaction.once('error', function(err) {
      assert.strictEqual(err.engine_result, 'tecINSUFF_FEE_P');
      done();
    });

    transaction.addId(TX_STREAM_TRANSACTION.transaction.hash);
    transactionManager.getPending().push(transaction);
    divvydConnection.sendJSON(lodash.extend({ }, TX_STREAM_TRANSACTION, {
      engine_result: 'tecINSUFF_FEE_P'
    }));
  });
  it('Handle received transaction -- not submitted', function(done) {
    divvydConnection.sendJSON(TX_STREAM_TRANSACTION);

    remote.once('transaction', function() {
      assert(transactionManager.getPending().getReceived(
        TX_STREAM_TRANSACTION.transaction.hash));
      done();
    });
  });
  it('Handle received transaction -- Account mismatch', function(done) {
    var tx = lodash.extend({ }, TX_STREAM_TRANSACTION);
    lodash.extend(tx.transaction, {
      Account: 'rMP2Y5EZrVZdFKsow11NoKTE5FjXuBQd3d'
    });
    divvydConnection.sendJSON(tx);

    setImmediate(function() {
      assert(!transactionManager.getPending().getReceived(
        TX_STREAM_TRANSACTION.transaction.hash));
      done();
    });
  });
  it('Handle received transaction -- not validated', function(done) {
    var tx = lodash.extend({ }, TX_STREAM_TRANSACTION, {
      validated: false
    });
    divvydConnection.sendJSON(tx);

    setImmediate(function() {
      assert(!transactionManager.getPending().getReceived(
        TX_STREAM_TRANSACTION.transaction.hash));
      done();
    });
  });
  it('Handle received transaction -- from account_tx', function(done) {
    var transaction = Transaction.from_json(ACCOUNT_TX_TRANSACTION.tx);
    transaction.once('success', function() {
      done();
    });

    transaction.addId(ACCOUNT_TX_TRANSACTION.tx.hash);
    transactionManager.getPending().push(transaction);
    transactionManager._transactionReceived(ACCOUNT_TX_TRANSACTION);
  });

  it('Adjust pending transaction fee', function(done) {
    var transaction = new Transaction(remote);
    transaction.tx_json = ACCOUNT_TX_TRANSACTION.tx;

    transaction.once('fee_adjusted', function(a, b) {
      assert.strictEqual(a, '10');
      assert.strictEqual(b, '24');
      assert.strictEqual(transaction.tx_json.Fee, '24');
      done();
    });

    transactionManager.getPending().push(transaction);

    divvydConnection.sendJSON({
      type: 'serverStatus',
      load_base: 256,
      load_factor: 256 * 2,
      server_status: 'full'
    });
  });

  it('Adjust pending transaction fee -- max fee exceeded', function(done) {
    transactionManager._maxFee = 10;

    var transaction = new Transaction(remote);
    transaction.tx_json = ACCOUNT_TX_TRANSACTION.tx;

    transaction.once('fee_adjusted', function() {
      assert(false, 'Fee should not be adjusted');
    });

    transactionManager.getPending().push(transaction);

    divvydConnection.sendJSON({
      type: 'serverStatus',
      load_base: 256,
      load_factor: 256 * 2,
      server_status: 'full'
    });

    setImmediate(done);
  });

  it('Adjust pending transaction fee -- no local fee', function(done) {
    remote.local_fee = false;

    var transaction = new Transaction(remote);
    transaction.tx_json = ACCOUNT_TX_TRANSACTION.tx;

    transaction.once('fee_adjusted', function() {
      assert(false, 'Fee should not be adjusted');
    });

    transactionManager.getPending().push(transaction);

    divvydConnection.sendJSON({
      type: 'serverStatus',
      load_base: 256,
      load_factor: 256 * 2,
      server_status: 'full'
    });

    setImmediate(done);
  });

  it('Wait ledgers', function(done) {
    transactionManager._waitLedgers(3, done);

    for (var i = 1; i <= 3; i++) {
      divvydConnection.closeLedger();
    }
  });

  it('Wait ledgers -- no ledgers', function(done) {
    transactionManager._waitLedgers(0, done);
  });

  it('Update pending status', function(done) {
    var transaction = Transaction.from_json(TX_STREAM_TRANSACTION.transaction);
    transaction.submitIndex = 1;
    transaction.tx_json.LastLedgerSequence = 10;

    var receivedMissing = false;
    var receivedLost = false;

    transaction.once('missing', function() {
      receivedMissing = true;
    });
    transaction.once('lost', function() {
      receivedLost = true;
    });
    transaction.once('error', function(err) {
      assert.strictEqual(err.engine_result, 'tejMaxLedger');
      assert(receivedMissing);
      assert(receivedLost);
      done();
    });

    transaction.addId(TX_STREAM_TRANSACTION.transaction.hash);
    transactionManager.getPending().push(transaction);

    for (var i = 1; i <= 10; i++) {
      divvydConnection.closeLedger();
    }
  });

  it('Update pending status -- finalized before max ledger exceeded',
    function(done) {
    var transaction = Transaction.from_json(TX_STREAM_TRANSACTION.transaction);
    transaction.submitIndex = 1;
    transaction.tx_json.LastLedgerSequence = 10;
    transaction.finalized = true;

    var receivedMissing = false;
    var receivedLost = false;

    transaction.once('missing', function() {
      receivedMissing = true;
    });
    transaction.once('lost', function() {
      receivedLost = true;
    });
    transaction.once('error', function() {
      assert(false, 'Should not err');
    });

    transaction.addId(TX_STREAM_TRANSACTION.transaction.hash);
    transactionManager.getPending().push(transaction);

    for (var i = 1; i <= 10; i++) {
      divvydConnection.closeLedger();
    }

    setImmediate(function() {
      assert(!receivedMissing);
      assert(!receivedLost);
      done();
    });
  });

  it('Handle reconnect', function(done) {
    var transaction = Transaction.from_json(TX_STREAM_TRANSACTION.transaction);

    var binaryTx = lodash.extend({}, ACCOUNT_TX_TRANSACTION, {
      ledger_index: ACCOUNT_TX_TRANSACTION.tx.ledger_index,
      tx_blob: SerializedObject.from_json(ACCOUNT_TX_TRANSACTION.tx).to_hex(),
      meta: SerializedObject.from_json(ACCOUNT_TX_TRANSACTION.meta).to_hex()
    });

    var hash = new SerializedObject(binaryTx.tx_blob).hash(0x54584E00).to_hex();

    transaction.addId(hash);

    transaction.once('success', function(res) {
      assert.strictEqual(res.engine_result, 'tesSUCCESS');
      done();
    });

    transactionManager.getPending().push(transaction);

    divvyd.once('request_account_tx', function(m, req) {
      var response = lodash.extend({}, ACCOUNT_TX_RESPONSE);
      response.result.transactions = [binaryTx];
      req.sendResponse(response, {id: m.id});
    });

    remote.disconnect(remote.connect);
  });

  it('Handle reconnect -- no matching transaction found', function(done) {
    var transaction = Transaction.from_json(TX_STREAM_TRANSACTION.transaction);

    var binaryTx = lodash.extend({}, ACCOUNT_TX_TRANSACTION, {
      ledger_index: ACCOUNT_TX_TRANSACTION.tx.ledger_index,
      tx_blob: SerializedObject.from_json(ACCOUNT_TX_TRANSACTION.tx).to_hex(),
      meta: SerializedObject.from_json(ACCOUNT_TX_TRANSACTION.meta).to_hex()
    });

    transactionManager._request = function() {
      // Resubmitting
      done();
    };

    transactionManager.getPending().push(transaction);

    divvyd.once('request_account_tx', function(m, req) {
      var response = lodash.extend({}, ACCOUNT_TX_RESPONSE);
      response.result.transactions = [binaryTx];
      req.sendResponse(response, {id: m.id});
    });

    remote.disconnect(remote.connect);
  });

  it('Handle reconnect -- account_tx error', function(done) {
    var transaction = Transaction.from_json(TX_STREAM_TRANSACTION.transaction);
    transactionManager.getPending().push(transaction);

    transactionManager._resubmit = function() {
      assert(false, 'Should not resubmit');
    };

    divvyd.once('request_account_tx', function(m, req) {
      req.sendResponse(ACCOUNT_TX_ERROR, {id: m.id});
      setImmediate(done);
    });

    remote.disconnect(remote.connect);
  });

  it('Submit transaction', function(done) {
    var transaction = remote.createTransaction('AccountSet', {
      account: ACCOUNT.address
    });

    var receivedInitialSuccess = false;
    var receivedProposed = false;
    transaction.once('proposed', function(m) {
      assert.strictEqual(m.engine_result, 'tesSUCCESS');
      receivedProposed = true;
    });
    transaction.once('submitted', function(m) {
      assert.strictEqual(m.engine_result, 'tesSUCCESS');
      receivedInitialSuccess = true;
    });

    divvyd.once('request_submit', function(m, req) {
      assert.strictEqual(m.tx_blob, SerializedObject.from_json(
        transaction.tx_json).to_hex());
      assert.strictEqual(transactionManager.getPending().length(), 1);
      req.sendResponse(SUBMIT_RESPONSE, {id: m.id});
      setImmediate(function() {
        var txEvent = lodash.extend({}, TX_STREAM_TRANSACTION);
        txEvent.transaction = transaction.tx_json;
        txEvent.transaction.hash = transaction.hash();
        divvydConnection.sendJSON(txEvent);
      });
    });

    transaction.submit(function(err, res) {
      assert(!err, 'Transaction submission should succeed');
      assert(receivedInitialSuccess);
      assert(receivedProposed);
      assert.strictEqual(res.engine_result, 'tesSUCCESS');
      assert.strictEqual(transactionManager.getPending().length(), 0);
      done();
    });
  });

  it('Submit transaction -- tec error', function(done) {
    var transaction = remote.createTransaction('AccountSet', {
      account: ACCOUNT.address,
      set_flag: 'asfDisableMaster'
    });

    var receivedSubmitted = false;
    transaction.once('proposed', function() {
      assert(false, 'Should not receive proposed event');
    });
    transaction.once('submitted', function(m) {
      assert.strictEqual(m.engine_result, 'tecNO_REGULAR_KEY');
      receivedSubmitted = true;
    });

    divvyd.once('request_submit', function(m, req) {
      assert.strictEqual(m.tx_blob, SerializedObject.from_json(
        transaction.tx_json).to_hex());
      assert.strictEqual(transactionManager.getPending().length(), 1);
      req.sendResponse(SUBMIT_TEC_RESPONSE, {id: m.id});
      setImmediate(function() {
        var txEvent = lodash.extend({}, TX_STREAM_TRANSACTION,
          SUBMIT_TEC_RESPONSE.result);
        txEvent.transaction = transaction.tx_json;
        txEvent.transaction.hash = transaction.hash();
        divvydConnection.sendJSON(txEvent);
      });
    });

    transaction.submit(function(err) {
      assert(err, 'Transaction submission should not succeed');
      assert(receivedSubmitted);
      assert.strictEqual(err.engine_result, 'tecNO_REGULAR_KEY');
      assert.strictEqual(transactionManager.getPending().length(), 0);
      done();
    });
  });

  it('Submit transaction -- ter error', function(done) {
    var transaction = remote.createTransaction('Payment', {
      account: ACCOUNT.address,
      destination: ACCOUNT2.address,
      amount: '1'
    });
    transaction.tx_json.Sequence = ACCOUNT_INFO_RESPONSE.result
    .account_data.Sequence + 1;

    var receivedSubmitted = false;
    transaction.once('proposed', function() {
      assert(false, 'Should not receive proposed event');
    });
    transaction.once('submitted', function(m) {
      assert.strictEqual(m.engine_result, 'terNO_ACCOUNT');
      receivedSubmitted = true;
    });

    divvyd.on('request_submit', function(m, req) {
      var deserialized = new SerializedObject(m.tx_blob).to_json();

      switch (deserialized.TransactionType) {
        case 'Payment':
          assert.strictEqual(transactionManager.getPending().length(), 1);
          assert.deepEqual(deserialized, transaction.tx_json);
          req.sendResponse(SUBMIT_TER_RESPONSE, {id: m.id});
          break;
        case 'AccountSet':
          assert.strictEqual(deserialized.Account, ACCOUNT.address);
          assert.strictEqual(deserialized.Flags, 2147483648);
          req.sendResponse(SUBMIT_RESPONSE, {id: m.id});
          req.closeLedger();
          break;
      }
    });
    divvyd.once('request_submit', function(m, req) {
      req.sendJSON(lodash.extend({}, LEDGER, {
        ledger_index: transaction.tx_json.LastLedgerSequence + 1
      }));
    });

    transaction.submit(function(err) {
      assert(err, 'Transaction submission should not succeed');
      assert.strictEqual(err.engine_result, 'tejMaxLedger');
      assert(receivedSubmitted);
      assert.strictEqual(transactionManager.getPending().length(), 0);
      transactionManager.once('sequence_filled', done);
    });
  });

  it('Submit transaction -- tef error', function(done) {
    var transaction = remote.createTransaction('AccountSet', {
      account: ACCOUNT.address
    });

    transaction.tx_json.Sequence = ACCOUNT_INFO_RESPONSE.result
    .account_data.Sequence - 1;

    var receivedSubmitted = false;
    var receivedResubmitted = false;
    transaction.once('proposed', function() {
      assert(false, 'Should not receive proposed event');
    });
    transaction.once('submitted', function(m) {
      assert.strictEqual(m.engine_result, 'tefPAST_SEQ');
      receivedSubmitted = true;
    });

    divvyd.on('request_submit', function(m, req) {
      assert.strictEqual(transactionManager.getPending().length(), 1);
      assert.strictEqual(m.tx_blob, SerializedObject.from_json(
        transaction.tx_json).to_hex());
      req.sendResponse(SUBMIT_TEF_RESPONSE, {id: m.id});
    });

    divvyd.once('request_submit', function(m, req) {
      transaction.once('resubmitted', function() {
        receivedResubmitted = true;
        req.sendJSON(lodash.extend({}, LEDGER, {
          ledger_index: transaction.tx_json.LastLedgerSequence + 1
        }));
      });

      req.closeLedger();
    });

    transaction.submit(function(err) {
      assert(err, 'Transaction submission should not succeed');
      assert(receivedSubmitted);
      assert(receivedResubmitted);
      assert.strictEqual(err.engine_result, 'tejMaxLedger');
      assert.strictEqual(transactionManager.getPending().length(), 0);
      done();
    });
  });

  it('Submit transaction -- tel error', function(done) {
    var transaction = remote.createTransaction('AccountSet', {
      account: ACCOUNT.address
    });

    var receivedSubmitted = false;
    var receivedResubmitted = false;
    transaction.once('proposed', function() {
      assert(false, 'Should not receive proposed event');
    });
    transaction.once('submitted', function(m) {
      assert.strictEqual(m.engine_result, 'telINSUF_FEE_P');
      receivedSubmitted = true;
    });

    divvyd.on('request_submit', function(m, req) {
      assert.strictEqual(transactionManager.getPending().length(), 1);
      assert.strictEqual(m.tx_blob, SerializedObject.from_json(
        transaction.tx_json).to_hex());
      req.sendResponse(SUBMIT_TEL_RESPONSE, {id: m.id});
    });

    divvyd.once('request_submit', function(m, req) {
      transaction.once('resubmitted', function() {
        receivedResubmitted = true;
        req.sendJSON(lodash.extend({}, LEDGER, {
          ledger_index: transaction.tx_json.LastLedgerSequence + 1
        }));
      });

      req.closeLedger();
    });

    transaction.submit(function(err) {
      assert(err, 'Transaction submission should not succeed');
      assert(receivedSubmitted);
      assert(receivedResubmitted);
      assert.strictEqual(err.engine_result, 'tejMaxLedger');
      assert.strictEqual(transactionManager.getPending().length(), 0);
      done();
    });
  });

  it('Submit transaction -- invalid secret', function(done) {
    remote.setSecret(ACCOUNT.address, ACCOUNT.secret + 'z');

    var transaction = remote.createTransaction('AccountSet', {
      account: ACCOUNT.address
    });

    divvyd.once('request_submit', function() {
      assert(false, 'Should not request submit');
    });

    transaction.submit(function(err) {
      assert.strictEqual(err.engine_result, 'tejSecretInvalid');
      assert.strictEqual(transactionManager.getPending().length(), 0);
      done();
    });
  });
});
