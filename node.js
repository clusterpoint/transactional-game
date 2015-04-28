require('./config.js');

var cps = require('cps-api');
var io = require('socket.io')(8080);
var clients = [],
	hashMap = [],
	INITIAL_VALUE = 200;

var conn = new cps.Connection(CONFIG.cps.host, CONFIG.cps.db, CONFIG.cps.username, CONFIG.cps.password, 'document', 'document/id', {account: CONFIG.cps.account_id});
//conn.debug = true;

io.on('connection', function (socket) {

	//io.emit('update_user_list',  { id : socket.id, balance: 200});
	socket.emit('init_new_user');

	socket.on('give_me_id', function() {
		socket.emit('set_new_id', socket.id);
		registerNewUser(socket.id, socket.id);
	});

	socket.on('already_have_id', function(id) {
		registerNewUser(id, socket.id);
	});

	console.log(clients);

	/**
	 * SOCKET EVENTS DESCRIBED HERE
	 */

	socket.on('transfer_value_to', function (data, sender) {
		console.log('Transfer credits to: ' + data.receiver + ' & amount: ' + data.quantity +
			' from: ' + socket.id);

		// validate input
		credits = parseInt(data.quantity, 10);//perform conversion check
		if (isNaN(credits)) {
			credits = 0;
		} else {
			// execute transaction
			try {
				conn.sendRequest(new cps.BeginTransactionRequest(), function (err, response) {
					//transaction started
					if (err) throw err; //throw exception

					// get user\'s  curent balance from database
					var retrieve_req = new cps.RetrieveRequest([data.receiver, sender]); //
					//perform search query
					conn.sendRequest(retrieve_req, function (err, retrieve_resp) {
						if (err) return console.error(err); // Handle error
						var xSender, xReceiver;

						if (retrieve_resp.results.document[0].id === sender) {
							xSender = retrieve_resp.results.document[0];
							xReceiver = retrieve_resp.results.document[1];
						} else {
							xSender = retrieve_resp.results.document[1];
							xReceiver = retrieve_resp.results.document[0];
						}
						if (xSender.balance > 0) {

							// update balance in database
							xSender.balance = parseInt(xSender.balance, 10) - data.quantity;
							xReceiver.balance = parseInt(xReceiver.balance, 10) + data.quantity;
							var documents = [xSender, xReceiver];

							conn.sendRequest(new cps.UpdateRequest(documents), function (err, resp) {
								if (err) throw console.error(err); // Handle error

								// update successful, lets commit!
								conn.sendRequest(new cps.CommitTransactionRequest(), function (err, response) {
									try {
										if (err) throw err;
										// commit successful, broadcast new balance
										//io.emit('update_users_points', obj);
										console.log('Transaction has been successful!');
										userUpdated(xSender);
										userUpdated(xReceiver);
										clients[hashMap[xSender.id]] = xSender.balance;
										clients[hashMap[xReceiver.id]] = xReceiver.balance;
									} catch (e) {
										conn.sendRequest(new cps.RollbackTransactionRequest());
										console.log(e);
									}
								}, 'json');
							});
						}
					});
				}, 'json');
			} catch (e) {
				console.log(e);
				conn.sendRequest(new cps.RollbackTransactionRequest());
			}
		}
	});

	socket.on('disconnect', function () {
		console.log('Client disconnected: ' + socket.id);
		var index = -1;
		for (var i = 0; i < clients.length; i++) {
			if (clients[i].socket == socket.id) {
				index = 1;
			}
		}
		if (index > -1) {
			clients.splice(index, 1);
		}
		updateClientList();
	});
});

function userUpdated(user) {
	io.emit('user_updated', user);
}

function updateClientList() {
	var tmp = {};
	tmp.clients = clients;
	//tmp.text = 'WTF???';
	io.emit('update_user_list', tmp);
	//console.log(tmp);
}

function registerNewUser(id, socket_id) {
	var search_req = new cps.SearchRequest(cps.Term(id, "id"));
	var xBalance = INITIAL_VALUE;
	conn.sendRequest(search_req, function (err, search_resp) {
		if (search_resp && search_resp.results.document.length > 0) {
			//user is already registered within the database
			//Init his balance
			xBalance = search_resp.results.document[0].balance;
		} else {
			//new user detected || cookies are disabled
			var insert_req = new cps.InsertRequest('<document><id>'+id+'</id><balance>'+INITIAL_VALUE+'</balance></document>');
			conn.sendRequest(insert_req, function(err, insert_resp) {
				if (err) console.error(err);
				console.log('New user registered: ' + insert_resp.document.id);
			});
		};

		var exists = -1;

		for (var i = 0; i < clients.length; i++) {
			if (clients[i].id === id) {
				clients[i].socket = socket_id;
				clients[i].balance = xBalance;
				exists  = 1;
			}
			hashMap[socket_id] = i;
		}
		if (exists === -1) {
			hashMap[socket_id] = clients.length;
			clients.push({ id: id, socket: socket_id, balance: xBalance });
		}
		updateClientList();
	}, 'json');
}

function testRetrieve(id) {
	var retrieve_req = new cps.RetrieveRequest('1');
	conn.sendRequest(retrieve_req, function (err, retrieve_resp) {
		if (err) return console.log('Error: ' + err); // Handle error

		if (retrieve_resp) {
			console.log(retrieve_resp.results.document[0].balance);
		}
	}, 'json');
}

/***************************TRASH
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
						}, 'json');
					});
				}
			});
		}, 'json');
	});

}***********************************/

console.log('Node.JS server started!');