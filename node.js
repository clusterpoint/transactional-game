require('./config.js');

var cps = require('cps-api');
var io = require('socket.io')(8080);
var clients = [];

var conn = new cps.Connection(CONFIG.cps.host, CONFIG.cps.db, CONFIG.cps.username, CONFIG.cps.password, 'document', '//document/id', {account: CONFIG.cps.account_id});
//conn.debug = true;

function broadcastCurrentBalance(socket) {
	//console.log('broadcastCurrentBalance');
	if (typeof(socket) === 'undefined') socket = false;
	//console.log('broadcastCurrentBalance2');
	var search_req = new cps.SearchRequest(cps.Term("1", "id"));
	//console.log(search_req);
	conn.sendRequest(search_req, function (err, search_resp) {
		if (err) return console.error(err); // Handle error
		//console.log('broadcastCurrentBalance3');
		//console.log(search_resp);
		//console.log('Values:');
		//console.log(search_resp.results);
		if (search_resp.results.document[0].balance) {
			//console.log('broadcastCurrentBalance4');
			if (socket !== false) {
				socket.emit('balance_changed', search_resp.results.document[0].balance);
				//console.log('broadcastCurrentBalance5');
			}
			else {
				io.emit('balance_changed', search_resp.results.document[0].balance);
				//console.log('broadcastCurrentBalance6');
			}
		}
	});
}

io.on('connection', function (socket) {

	console.log('connection');

	// send balance on new connection to this socket
	broadcastCurrentBalance(socket);

	io.emit('new_user_connected',  { user_id : socket.id});

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

				if (search_resp.results.document[0].balance) {

					// update balance in database
					var obj = {
						id     : 1,
						balance: parseInt(search_resp.results.document[0].balance, 10) + credits
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

function registerNewUser(id) {
	var insert_req = cps.InsertRequest();
	conn.sendRequest(insert_req, function(err, insert_resp) {
		console.log(insert_resp);
	});
}


console.log('Node.JS server started!');