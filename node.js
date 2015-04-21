require('./config.js');

var cps = require('cps-api');
var io = require('socket.io')(8080);

var conn = new cps.Connection(CONFIG.cps.host, CONFIG.cps.db, CONFIG.cps.username, CONFIG.cps.password, 'document', '//document/id', {account: CONFIG.cps.account_id});
//conn.debug = true;

function broadcastCurrentBalance(socket) {
	if (typeof(socket) === 'undefined') socket = false;

	var search_req = new cps.SearchRequest(cps.Term("1", "id"));
	conn.sendRequest(search_req, function (err, search_resp) {
		if (err) return console.error(err); // Handle error

		if (search_resp.results.document.balance) {
			if (socket !== false) {
				socket.emit('balance_changed', search_resp.results.document.balance);
			}
			else {
				io.emit('balance_changed', search_resp.results.document.balance);
			}
		}
	});
}

io.on('connection', function (socket) {

	console.log('connection');

	// send balance on new connection to this socket
	broadcastCurrentBalance(socket);

	socket.on('transaction', function (credits) {
		console.log('transaction: ' + credits);

		// validate input
		credits = parseInt(credits, 10);
		if (isNaN(credits)) {
			credits = 0;
		}

		// execute transaction

		conn.sendRequest(new cps.BeginTransactionRequest(), function (err, response) {
			if (err) throw err;

			// get curent balance from database
			var search_req = new cps.SearchRequest(cps.Term("1", "id"));

			conn.sendRequest(search_req, function (err, search_resp) {
				if (err) return console.error(err); // Handle error

				if (search_resp.results.document.balance) {

					// update balance in database
					var obj = {
						id     : 1,
						balance: parseInt(search_resp.results.document.balance, 10) + credits
					};
					var documents = [obj];

					conn.sendRequest(new cps.UpdateRequest(documents), function (err, resp) {
						if (err) return console.error(err); // Handle error

						// update successful, lets commit!
						conn.sendRequest(new cps.CommitTransactionRequest(), function (err, response) {
							if (err) throw err;
							// commit successful, broadcast new balance
							io.emit('balance_changed', obj.balance);
						}, 'xml');
					});
				}
			});
		}, 'xml');
	});
});


console.log('Node.JS server started!');