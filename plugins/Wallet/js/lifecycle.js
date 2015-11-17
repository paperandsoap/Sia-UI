'use strict';

// Library for working with clipboard
const Clipboard = require('clipboard');
// How often /wallet updates
var refreshRate = 500; // half-second
var finalRefreshRate = 1000 * 60 * 5; // five-minutes
// Keeps track of if the view is shown
var updating;
// Variable to store api result values
var wallet = {};

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Updating  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Make API calls, sending a channel name to listen for responses
function update() {
	IPC.sendToHost('api-call', '/wallet', 'update-status');

	// Get list of wallet addresses
	IPC.sendToHost('api-call', {
		url: '/wallet/addresses',
		type: 'GET',
	}, 'update-address');

	updating = setTimeout(update, refreshRate);
}

// Get transactions for a specific wallet address
function updateAddrTxn(event) {
	$('#transaction-list').empty();
	IPC.sendToHost('api-call', {
		url: '/wallet/transactions/' + event.target.id,
		type: 'GET',
	}, 'update-history');
}

// Append wallet address to Addresses list
function appendAddress(address) {
	// Create only new addresses
	if (typeof(address) === 'undefined') { return; }
	var addr = $('#addressbp').clone();

	// Insert values
	addr.find('.listnum').html($('#address-list').children().length);
	addr.find('.address').html(address);
	addr.find('.address').attr('id', address);
	addr.find('.address').click(updateAddrTxn);

	// Make copy-to-clipboard buttin clickable
	addr.find('.copy-address').click(function() {
		Clipboard.writeText(address);
		notify('Copied address to clipboard', 'copied');
	});

	// Append, but not display, address
	$('#address-list').append(addr);
}

// Add transactions to view list per address
addResultListener('update-address', function(result) {
	// Update address list
	$('#address-list').empty();
	result.addresses.forEach(function (address) {
		appendAddress(address.address);
	});

	/* Fetch all wallet transactions by iterate over wallet addresses
	var loopmax = result.addresses.length;
	var counter = 0;
	(function next() {
		setTimeout(function() {
			updateAddrTxn(result.addresses[counter].address);
			next();
		}, 50); // force 50 ms delay between each GET request
	})();*/
});

// Update wallet summary in header
addResultListener('update-status', function(result) {
	wallet = result;

	// slow down after first successful call
	refreshRate = finalRefreshRate;

	// Show correct lock status.
	if (!wallet.encrypted) {
		setUnencrypted();
	} else if (!wallet.unlocked) {
		setLocked();
	} else if (wallet.unlocked) {
		setUnlocked();
	}

	// Update balance confirmed and uncomfirmed
	var bal = convertSiacoin(wallet.confirmedsiacoinbalance);
	var pend = convertSiacoin(wallet.unconfirmedincomingsiacoins).sub(convertSiacoin(wallet.unconfirmedoutgoingsiacoins));
	if (wallet.unlocked && wallet.encrypted) {
		$('#confirmed').show();
		$('#unconfirmed').show();
		$('#confirmed').html('Balance: ' + bal + ' S');
		$('#unconfirmed').html('Pending: ' + pend + ' S');
	} else {
		$('#confirmed').hide();
		$('#unconfirmed').hide();
	}
});

// Append a transaction to Transactions list
function appendTransaction(txn) {
	// Add only new transactions
	if (typeof(txn) === 'undefined') { return; }
	if ($('#' + txn.transactionid)) { return; }
	var txnElement = $('#transactionbp').clone();
	txnElement.id = txn.transactionid;
	txnElement.timestamp = txn.confirmationtimestamp * 1000;

	// Compute transaction net amount
	var amount = new BigNumber(0);
	if (txn.inputs) {
		txn.inputs.forEach( function(input) {
			if (input.walletaddress) {
				amount = amount.sub(input.value);
			}
		});
	}
	if (txn.outputs) {
		txn.outputs.forEach( function(output) {
			if (output.walletaddress) {
				amount = amount.add(output.value);
			}
		});
	}

	// Convert hastings to siacoin and round to 2 decimals
	amount = convertSiacoin(amount);
	if (amount === 0) {
		return;
	}

	// Format transaction timestamp
	var timestamp = new Date(txn.confirmationtimestamp * 1000);
	var time = timestamp.toLocaleString();

	// Insert transaction values in UI
	txnElement.find('.amount').html(amount + ' S');
	txnElement.find('.txnid').html(txn.transactionid);
	txnElement.find('.time').html(time);

	// Set transaction type
	if (amount < 0) {
		txnElement.find('.send').show();
		txnElement.find('.receive').hide();
	} else {
		txnElement.find('.send').hide();
		txnElement.find('.receive').show();
	}

	// Display transaction
	$('#transaction-list').append(txnElement);
	txnElement.show();
}

// Update transaction history
addResultListener('update-history', function(result) {
	if (result.confirmedtransactions) {
		// Reverse direction of transactions list (most recent first)
		result.confirmedtransactions.reverse();
		result.confirmedtransactions.forEach(function (txn) {
			appendTransaction(txn);
		});
	}
	// TODO Register unconfirmed transactions
	/*if (result.unconfirmed) {
		result.unconfirmedtransactions.forEach(function(processedtxn) {
		});
	}*/
});

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Start/Stop ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Called upon showing
function start() {
	// DEVTOOL: uncomment to bring up devtools on plugin view
	// IPC.sendToHost('devtools');

	update();
}

// Called upon transitioning away from this view
function stop() {
	// Stop updating
	clearTimeout(updating);
}

