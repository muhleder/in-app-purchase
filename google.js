var fs = require('fs');
var crypto = require('crypto');
var async = require('async');

var sandboxPkey = 'iap-sandbox';
var livePkey = 'iap-live';
var config = null;
var keyPathMap = {};
var publicKeyMap = {};


var pkeyPath = null;

module.exports.readConfig = function (configIn) {
	config = configIn;
	if (!config) {
		config = {};
	}
	keyPathMap.sandbox = config.googlePublicKeyPath + sandboxPkey;
	keyPathMap.live = config.googlePublicKeyPath + livePkey;
};

module.exports.setup = function (cb) {
	if (!config || !config.googlePublicKeyPath) {
		// no google iap
		return cb();
	}
	var keys = Object.keys(keyPathMap);
	async.eachSeries(keys, function (key, next) {
		var pkeyPath = keyPathMap[key];
		fs.readFile(pkeyPath, function (error, fileData) {
			// we are ignoring missing public key file(s)
			if (error) {
				return next();
			}
			publicKeyMap[key] = fileData.toString().replace(/\s+$/, '');
			next();
		});
	}, cb);
};

// receipt is an object
/*
* receipt = { data: 'receipt data', signature: 'receipt signature' };
*/
module.exports.validatePurchase = function (receipt, cb) {
	if (typeof receipt !== 'object') {
		return cb(new Error('malformed receipt: ' + receipt));
	}
	if (!receipt.data || !receipt.signature) {
		return cb(new Error('missing receipt data:\n' + JSON.stringify(receipt)));
	}
	// try live first
	validatePublicKey(receipt, getPublicKey(publicKeyMap.live), function (error, data) {
		if (error) {
			// now try sandbox
			validatePublicKey(receipt, getPublicKey(publicKeyMap.sandbox), function (error2, data) {
				if (error2) {
					// we will send the error from live only
					return cb(error);
				}
				// sandbox worked
				cb(null, data);
			});
			return;
		}
		// live worked
		cb(null, data);
	});
};

function getPublicKey(publicKey) {
	if (!publicKey) {
		return null;
	}
	var key = chunkSplit(publicKey, 64, '\n'); 
	var pkey = '-----BEGIN PUBLIC KEY-----\n' + key + '-----END PUBLIC KEY-----\n';
	return pkey;	
}

function validatePublicKey(receipt, pkey, cb) {
	if (!receipt || !receipt.data) {
		return cb(new Error('missing receipt data'));
	}
	if (!pkey) {
		return cb(new Error('missing public key'));
	}
	var validater = crypto.createVerify('SHA1');
	validater.update(receipt.data);
	var valid = validater.verify(pkey, receipt.signature, 'base64');
	if (valid) {
		// validated successfully
		var data = JSON.parse(receipt.data);
		data.status = 0;
		return cb(null, data);
	}
	// failed to validate
	cb(new Error('failed to validate purchase'));
}

function chunkSplit(str, len, end) {
	len = parseInt(len, 10) || 76;
	if (len < 1) {
		return false;
	}
	end = end || '\r\n';
	return str.match(new RegExp('.{0,' + len + '}', 'g')).join(end);
}