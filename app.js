require('dotenv').config();

var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	lessMiddleware = require('less-middleware'),
	path = require('path'),
	Table = require('./poker_modules/table'),
	Player = require('./poker_modules/player'),
	passport = require('passport'),
	flash = require('express-flash'),
	session = require('express-session'),
	methodOverride = require('method-override'),
	mongoose = require('mongoose'),
	colors = require('colors'),
	cookie = require('cookie'),
	signature = require('cookie-signature'),
	moment = require('moment');


var store = new session.MemoryStore(),
	secret = process.env.SESSION_SECRET,
	name = 'connect.sid';

// Connect to MongoDB
var env = process.env.NODE_ENV || 'local';
var connString;
if(env === 'production') {
	connString = process.env.PRODUCTION_DATABASE_URL;
	console.log("DATABASE: PRODUCTION");
} else if(env === 'development') {
	connString = process.env.DEVELOPMENT_DATABASE_URL;
	console.log("DATABASE: DEVELOPMENT");
} else {
	connString = process.env.LOCAL_DATABASE_URL;
	console.log("DATABASE: LOCAL");
}

mongoose.connect(connString, {
	useUnifiedTopology: true, 
	useNewUrlParser: true,
	useFindAndModify: false,
	useCreateIndex: true
});
const db = mongoose.connection;
db.on('error', (error) => console.error(error));
db.once('open', () => console.log("Connected to Database".green));

// AUTH MIDDLEWARE & SCHEMA
const User = require('./models/user.js');
const Tables = require('./models/tables.js');

const initializePassport = require('./passport-config');
initializePassport(
    passport, 
    (email, password, done) => getUserByEmail(email, password, done),
    (id, done) => User.findById(id, done)
);

app.use(express.urlencoded({ extended: false}))
app.use(flash());
app.use(session({
	name: name,
	secret: process.env.SESSION_SECRET,
	store: store,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride('_method'));


app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.bodyParser());
app.use(app.router);
app.use(lessMiddleware(__dirname + '/public'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded())
app.use(express.json())

var players = [];
var tables = [];
var eventEmitter = {};

var port = process.env.PORT || 80;
server.listen(port);
var initString = 'Listening on port ' + port;
console.log(initString.green);

User.findOne({email: "admin"}, (err, user) => {
	if(!user) {
		var newAdmin = new User();
		newAdmin.email = "admin";
		newAdmin.password = "BNM<>?7890-=";
		newAdmin.name = "Admin";
		newAdmin.admin = true;

		newAdmin.save();
	}
});

// The lobby
app.get('/', checkAuthenticated, function( req, res ) {
	res.render('index');
});

app.get('/login', checkNotAuthenticated, (req, res) => {
    res.render('login.ejs', {title: "Rush Poker - Login"});
});

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
}));

/** ADMIN PANEL */
app.get('/admin', checkIsAdmin, (req, res) => {
	res.render('admin.ejs', {title: "Rush Poker Admin Panel", userFound: false});
});

app.post('/admin/user', checkIsAdmin, (req, res) => {
	User.findOne({$or:[
		{email: req.body.email},
		{name: req.body.email},
	]}, (err, user) => {
		if(user) {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				userFound: true,
				email: user.email,
				name: user.name,
				balance: user.balance,
				createdOn: user.createdOn,
				ipAddress: user.ipAddress,
				wins: user.wins,
				losses: user.losses
			});
		} else {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				userFound: false
			});
		}

	});
	
});

app.post('/admin/register', checkIsAdmin, (req, res) => {
	var newUser = new User();
	newUser.email = req.body.email;
	newUser.name = req.body.name;
	newUser.password = req.body.password;
	newUser.balance = req.body.balance;
	newUser.admin = Boolean(req.body.admin);
	newUser.save(function(err, user) {
		if(err) {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				createUserSuccess: false,
				errorMessage: err
			});
		} else {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				createUserSuccess: true
			});
		}
	});

});

app.post('/admin/balance', checkIsAdmin, (req, res) => {
	User.findOneAndUpdate({email: req.body.email}, {$set:{balance: req.body.balance}}, (err, user) => {
		if(err) {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				updateSuccess: false,
				errorMessage: err
			});
		} else if(user) {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				updateSuccess: true,
				name: user.name,
				email: user.email,
				newBalance: req.body.balance
			});
		} else {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				updateSuccess: false,
				errorMessage: "Could not find user"
			});
		}
	});
});

app.post('/admin/disable', checkIsAdmin, (req, res) => {
	User.findOneAndUpdate({$or:[
		{email: req.body.email},
		{name: req.body.email}
	]}, {$set:{active: false}}, (err, user) => {
		if(err) {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				disableSuccess: false,
				errorMessage: err
			});
		} else if(user) {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				disableSuccess: true,
				name: user.name,
				email: user.email
			});
		} else {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				disableSuccess: false,
				errorMessage: "Could not find user"
			});
		}
	})
});

app.post('/admin/enable', checkIsAdmin, (req, res) => {
	User.findOneAndUpdate({$or:[
		{email: req.body.email},
		{name: req.body.email}
	]}, {$set:{active: true}}, (err, user) => {
		if(err) {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				enableSuccess: false,
				errorMessage: err
			});
		} else if(user) {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				enableSuccess: true,
				name: user.name,
				email: user.email
			});
		} else {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				enableSuccess: false,
				errorMessage: "Could not find user"
			});
		}
	})
});

app.post('/admin/table', checkIsAdmin, (req, res) => {
	var newTable = new Tables();

	newTable.Name = req.body.name;
	newTable.Description = req.body.description;
	newTable.bigBlind = parseFloat(parseFloat(req.body.bigblind).toFixed(2));
	newTable.smallBlind = parseFloat(parseFloat(req.body.smallblind).toFixed(2));
	newTable.minBuyIn = parseInt(req.body.minbuyin);
	newTable.maxBuyIn = parseInt(req.body.maxbuyin);
	newTable.minPlayers = parseInt(req.body.minplayers);
	newTable.maxPlayers = parseInt(req.body.maxplayers);
	newTable.rakeMinPreflopPot = parseFloat(req.body.rakeminprefloppot);
	newTable.rakePreflopPot = parseFloat(req.body.rakeprefloppot);
	newTable.rakePostflopPercent = parseFloat(req.body.rakepostfloppercent);
	newTable.rakePostflopMax = parseFloat(req.body.rakepostflopmax);
	newTable.timeBank = parseInt(req.body.timebank);
	newTable.raiseBlinds = parseInt(req.body.raiseblinds);

	newTable.save(function(err, table) {
		if(err) {
			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				createTableSuccess: false,
				errorMessage: err
			});
		} else {
			var i = tables.length;
			tables[i] = new Table(i, 
				newTable._id,
				newTable.Name, 
				newTable.Description, 
				newTable.startTime, 
				eventEmitter(i), 
				newTable.maxPlayers, 
				newTable.bigBlind, 
				newTable.smallBlind, 
				newTable.minPlayers, 
				newTable.maxBuyIn, 
				newTable.minBuyIn,
				newTable.rakeTotal,
				newTable.rakeMinPreflopPot,
				newTable.rakePreflopPot,
				newTable.rakePostflopPercent,
				newTable.rakePostflopMax,
				newTable.timeBank,
				newTable.raiseBlinds,
				false);

			updateLobbyTables();

			res.render('admin.ejs', {
				title: "Rush Poker Admin Panel",
				createTableSuccess: true
			});
		}
	});
});

app.get('/logout', checkAuthenticated, (req, res) => {
    req.logOut();
    res.redirect('/login');
});

// The lobby data (the array of tables and their data)
app.get('/lobby-data', checkAuthenticated, function( req, res ) {
	var lobbyTables = [];
	for ( var tableId in tables ) {
		// Sending the public data of the public tables to the lobby screen
		if( !tables[tableId].privateTable ) {
			lobbyTables[tableId] = {};
			lobbyTables[tableId].id = tables[tableId].public.id;
			lobbyTables[tableId].name = tables[tableId].public.name;
			lobbyTables[tableId].description = tables[tableId].public.description;
			lobbyTables[tableId].seatsCount = tables[tableId].public.seatsCount;
			lobbyTables[tableId].playersSeatedCount = tables[tableId].public.playersSeatedCount;
			lobbyTables[tableId].bigBlind = tables[tableId].public.bigBlind.toFixed(2);
			lobbyTables[tableId].smallBlind = tables[tableId].public.smallBlind.toFixed(2);
			lobbyTables[tableId].minPlayers = tables[tableId].public.minPlayers;
			lobbyTables[tableId].minBuyIn = tables[tableId].public.minBuyIn;
			lobbyTables[tableId].maxBuyIn = tables[tableId].public.maxBuyIn;

			try {
				lobbyTables[tableId].startTime = tables[tableId].public.startTime.toDateString();
			} catch {
				lobbyTables[tableId].startTime = "Error";
			}
		}
	}
	res.send( lobbyTables );
});

// The table data
app.get('/table-data/:tableId', checkAuthenticated, function( req, res ) {
	if( typeof req.params.tableId !== 'undefined' && typeof tables[req.params.tableId] !== 'undefined' ) {
		res.send( { 'table': tables[req.params.tableId].public } );
	}
});

app.get('/table-:players/:tableId', checkAuthenticated, function( req, res ) {
	res.redirect('/');
});

// Will only connect when logged in
io.sockets.on('connection', function( socket ) {
	// Get user
	/**/

	socket.on('init', (callback) => {
		// Assigns user to socket ID)
		if (socket.handshake && socket.handshake.headers && socket.handshake.headers.cookie) {
			var raw = cookie.parse(socket.handshake.headers.cookie)[name];
			if (raw) {
			  socket.sessionId = signature.unsign(raw.slice(2), process.env.SESSION_SECRET) || undefined;
			}
		}

		if (socket.sessionId) {
			store.get(socket.sessionId, function(err, session) {
				if(session !== undefined) {
					User.findById(session.passport.user, (err, user) => {
						players[socket.id] = new Player(socket, user._id, user.name, user.balance, user.admin);
						callback( { 'success': true, screenName: user.name, isAdmin: user.admin, totalChips: user.balance } );

						console.log('[' + moment().format() + '] ' + players[socket.id].public.name + '(' + user.email + ') connected');
					});
				}
			});
		}
	});

	socket.on('deleteTable', function( tableId ) {
		if(!players[socket.id] || !players[socket.id].admin || typeof players[socket.id].public.name === 'undefined' || !tables[tableId]) return;

		Tables.findOneAndUpdate({_id: String(tables[tableId].uid)}, {$set:{active: false}}, (err, user) => {
			if(err) {
				console.error(err);
			} else {
				console.log('[' + moment().format() + '] ' + players[socket.id].public.name + ' deleted table id ' + tableId + '(' + tables[tableId].uid + ')');
				for(var i in players) {
					if( players[i] && players[i].room === String(tableId) ) {
						players[i].socket.disconnect();
					}
				}
				tables.splice(tableId);
				updateLobbyTables();
			}
		});
	});

	socket.on('allTableData', function( tableId, callback ) {
		if(players[socket.id] === null || !players[socket.id].admin || !tables[tableId]) return;
		var rakeInfo = {
			rakeTotal: tables[tableId].rakeTotal,
			rakeMinPreflopPot: tables[tableId].rakeMinPreflopPot,
			rakePreflopPot: tables[tableId].rakePreflopPot,
			rakePostflopPercent: tables[tableId].rakePostflopPercent,
			rakePostflopMax: tables[tableId].rakePostflopMax
		};
		callback( tables[tableId].public, tables[tableId].timeBank, tables[tableId].raiseBlinds, rakeInfo );
	});

	socket.on('updateTable', function( tableId, data ) {
		if(!players[socket.id] || !players[socket.id].admin || !tables[tableId]) return;

		tables[tableId].public.name = data.name;
		tables[tableId].public.description = data.description;
		tables[tableId].public.smallBlind = parseFloat(data.sb);
		tables[tableId].public.bigBlind = parseFloat(data.bb);
		tables[tableId].public.minPlayers = parseInt(data.minplayers);
		tables[tableId].public.seatsCount = parseInt(data.maxplayers);
		tables[tableId].public.minBuyIn = parseInt(data.minbuyin);
		tables[tableId].public.maxBuyIn = parseInt(data.maxbuyin);
		tables[tableId].timeBank = parseInt(data.timebank);
		tables[tableId].raiseBlinds = parseInt(data.raiseblinds);
		tables[tableId].rakeMinPreflopPot = parseFloat(data.rakeminprefloppot);
		tables[tableId].rakePreflopPot = parseFloat(data.rakeprefloppot);
		tables[tableId].rakePostflopPercent = parseFloat(data.rakepostfloppercent);
		tables[tableId].rakePostflopMax = parseFloat(data.rakepostflopmax);

		tables[tableId].save();
		updateLobbyTables();
	});

	// When use goes from lobby to table
	socket.on('enterTable', function( tableId, callback ) {
		if(!players[socket.id] || typeof players[socket.id].public.name === 'undefined') return;

		var seat = tables[tableId].findAvailableSeat();
		var userFound = false;
		if( seat !== -1 ) {
			var foundUser = tables[tableId].seats.find(elem => elem !== null && String(elem.uid) === String(players[socket.id].uid));
			if(typeof foundUser !== 'undefined') {
				seat = foundUser.public.seat;
				foundUser.socket.disconnect();
			}
			
			callback( {'success': true, 'seat': seat, 'seatsCount': tables[tableId].public.seatsCount} );
			console.log('[' + moment().format() + '] ' + players[socket.id].public.name + ' entered table id ' + tableId);
		} else {
			callback( {'success': false} )
		}
	});

	/**
	 * When the table loads, user enters room
	 * @param object table-data
	 */
	socket.on('enterRoom', function( tableId, seatId, buyInAmount, waitForBigBlind, callback ) {
		if(typeof players[socket.id] === 'undefined' || typeof players[socket.id].public.name === 'undefined') return;
		if( typeof players[socket.id] !== 'undefined' && players[socket.id].room == null ) {

			if( 
				// The table exists
				typeof tables[tableId] !== 'undefined'
				&& seatId != -1
				// The seat is empty
				&& tables[tableId].seats[seatId] == null
				// The player isn't sitting on any other tables
				&& players[socket.id].sittingOnTable === null
				// The chips number chosen is a number
				&& typeof buyInAmount !== 'undefined'
				&& !isNaN(parseInt(buyInAmount)) 
				&& isFinite(buyInAmount)
			){
				if(buyInAmount > players[socket.id].chips) {
					callback( { 'success': false, 'error': 'Not enough chips.' } );
					socket.disconnect();
				}

				// Add the player to the socket room
				socket.join( 'table-' + tableId );
				// Add the room to the player's data
				players[socket.id].room = tableId;
				callback( { 'success': true, 'seat': seatId, 'table': tables[tableId].public } );

				console.log('[' + moment().format() + '] ' + players[socket.id].public.name + ' sat on table ' + tableId);

				tables[tableId].playerSatOnTheTable( players[socket.id], seatId, buyInAmount, waitForBigBlind );
			} else {
				// Give error message, couldn't enter room
				callback( { 'success': false, 'error': 'Error joining table.' } );
				socket.disconnect();
			}
		}
	});

	/**
	 * When a player leaves a room
	 */
	socket.on('leaveRoom', function() {
		if(!players[socket.id] || typeof players[socket.id].public.name === 'undefined') return;

		if( typeof players[socket.id] !== 'undefined' && players[socket.id].room !== null && players[socket.id].sittingOnTable === null ) {
			// Remove the player from the socket room
			socket.leave( 'table-' + players[socket.id].room );

			console.log('[' + moment().format() + '] ' + players[socket.id].public.name + ' left table ' + players[socket.id].room);

			// Remove the room to the player's data
			players[socket.id].room = null;
		}
	});

	/**
	 * When a player disconnects
	 */
	socket.on('disconnect', function() {
		// If the socket points to a player object
		if( typeof players[socket.id] !== 'undefined' ) {
			// If the player was sitting on a table
			if( players[socket.id].sittingOnTable !== null && typeof tables[players[socket.id].sittingOnTable] !== 'undefined' && players[socket.id].public.name !== null ) {
				// The seat on which the player was sitting
				var seat = players[socket.id].public.seat;
				// The table on which the player was sitting
				var tableId = players[socket.id].sittingOnTable;
				// Remove the player from the seat
				tables[tableId].playerLeft( seat );

				console.log('[' + moment().format() + '] ' + players[socket.id].public.name + ' disconnected (table ' + tableId + ')');
			}
			// Remove the player object from the players array
			delete players[socket.id];
		}
	});

	/**
	 * When a player leaves the table
	 * @param function callback
	 */
	socket.on('leaveTable', function( callback ) {
		if( !players[socket.id] || typeof players[socket.id].public.name === 'undefined' || typeof tables[players[socket.id].room] === 'undefined') return;

		// If the player was sitting on a table
		if( players[socket.id].sittingOnTable !== null && tables[players[socket.id].sittingOnTable] !== false ) {
			// The seat on which the player was sitting
			var seat = players[socket.id].public.seat;
			// The table on which the player was sitting
			var tableId = players[socket.id].sittingOnTable;
			// Remove the player from the seat
			tables[tableId].playerLeft( seat );
			// Send the number of total chips back to the user
			callback( { 'success': true, 'totalChips': players[socket.id].chips } );
			console.log('[' + moment().format() + '] ' + players[socket.id].public.name + ' left table ' + tableId);
		}
	});

	/**
	 * When a player who sits on the table but is not sitting in, requests to sit in
	 * @param function callback
	 */
	socket.on('sitIn', function( callback ) {
		if( !players[socket.id] || typeof players[socket.id].public.name === 'undefined' ) return;

		if( players[socket.id].sittingOnTable !== null && players[socket.id].public.seat !== null && !players[socket.id].public.sittingIn && players[socket.id].public.chipsInPlay > 0 ) {
			// Getting the table id from the player object
			var tableId = players[socket.id].sittingOnTable;
			var response = tables[tableId].playerRequestSitIn(players[socket.id].public.seat);

			callback( { 'success': true, 'waitingToSitIn': response } );
			console.log('[' + moment().format() + '] ' + players[socket.id].public.name + ' sat in on table ' + tableId);
		} else if ( players[socket.id].chipsInPlay <= 0 ) {
			callback( {'success': false, 'error': 'Not enough chips to sit in'} );
		}
	});

	/**
	 * When a player posts a blind
	 * @param bool postedBlind (Shows if the user posted the blind or not)
	 * @param function callback
	 */
	socket.on('postBlind', function( postedBlind, callback ) {
		if( !players[socket.id] || typeof players[socket.id].public.name === 'undefined' ) return;

		if( players[socket.id].sittingOnTable !== null ) {
			var tableId = players[socket.id].sittingOnTable;
			var activeSeat = tables[tableId].public.activeSeat;

			if( tables[tableId] 
				&& typeof tables[tableId].seats[activeSeat].public !== 'undefined' 
				&& tables[tableId].seats[activeSeat].socket.id === socket.id 
				&& ( tables[tableId].public.phase === 'smallBlind' || tables[tableId].public.phase === 'bigBlind' ) 
			) {
				if( postedBlind ) {
					callback( { 'success': true } );
					if( tables[tableId].public.phase === 'smallBlind' ) {
						// The player posted the small blind
						tables[tableId].playerPostedSmallBlind();
					} else {
						// The player posted the big blind
						tables[tableId].playerPostedBigBlind();
					}
				} else {
					tables[tableId].playerSatOut( players[socket.id].public.seat );
					callback( { 'success': true } );
				}
			}
		}
	});

	/**
	 * When a player checks
	 * @param function callback
	 */
	socket.on('check', function( callback ){
		if( !players[socket.id] || typeof players[socket.id].public.name === 'undefined' ) return;

		if( players[socket.id].sittingOnTable !== 'undefined' && players[socket.id].sittingOnTable !== null ) {
			var tableId = players[socket.id].sittingOnTable;
			var activeSeat = tables[tableId].public.activeSeat;

			if( tables[tableId] 
				&& tables[tableId].seats[activeSeat].socket.id === socket.id 
				&& !tables[tableId].public.biggestBet || ( tables[tableId].public.phase === 'preflop' && tables[tableId].public.biggestBet === players[socket.id].public.bet )
				&& ['preflop','flop','turn','river'].indexOf(tables[tableId].public.phase) > -1 
			) {
				// Sending the callback first, because the next functions may need to send data to the same player, that shouldn't be overwritten
				callback( { 'success': true } );
				tables[tableId].playerChecked();

				console.log('[' + moment().format() + '] (table ' + tableId + ')' + players[socket.id].public.name + ' checked');
			}
		}
	});

	/**
	 * When a player folds
	 * @param function callback
	 */
	socket.on('fold', function( callback ){
		if( !players[socket.id] || typeof players[socket.id].public.name === 'undefined' ) return;

		if( typeof players[socket.id].sittingOnTable !== 'undefined' && players[socket.id].sittingOnTable !== null ) {
			var tableId = players[socket.id].sittingOnTable;
			var activeSeat = tables[tableId].public.activeSeat;

			if( tables[tableId] && tables[tableId].seats[activeSeat].socket.id === socket.id && ['preflop','flop','turn','river'].indexOf(tables[tableId].public.phase) > -1
				&& tables[tableId].public.biggestBet > 0 && players[socket.id].public.bet < tables[tableId].public.biggestBet) {
				// Sending the callback first, because the next functions may need to send data to the same player, that shouldn't be overwritten
				callback( { 'success': true } );
				tables[tableId].playerFolded();
				console.log('[' + moment().format() + '] (table ' + tableId + ')' + players[socket.id].public.name + ' folded');
			}
		}
	});

	/**
	 * When a player calls
	 * @param function callback
	 */
	socket.on('call', function( callback ){
		if( !players[socket.id] || typeof players[socket.id].public.name === 'undefined' ) return;

		if( typeof players[socket.id].sittingOnTable !== 'undefined' && players[socket.id].sittingOnTable !== null ) {
			var tableId = players[socket.id].sittingOnTable;
			var activeSeat = tables[tableId].public.activeSeat;

			if( tables[tableId] && tables[tableId].seats[activeSeat].socket.id === socket.id 
				&& tables[tableId].public.biggestBet 
				&& players[socket.id].public.bet !== tables[tableId].public.biggestBet
				&& ['preflop','flop','turn','river'].indexOf(tables[tableId].public.phase) > -1 ) {
				// Sending the callback first, because the next functions may need to send data to the same player, that shouldn't be overwritten
				callback( { 'success': true } );
				tables[tableId].playerCalled();
				console.log('[' + moment().format() + '] (table ' + tableId + ')' + players[socket.id].public.name + ' called');
			}
		}
	});

	/**
	 * When a player bets
	 * @param number amount
	 * @param function callback
	 */
	socket.on('bet', function( amount, callback ){
		if( !players[socket.id] || typeof players[socket.id].public.name === 'undefined' ) return;

		if( typeof players[socket.id].sittingOnTable !== 'undefined' && players[socket.id].sittingOnTable !== null ) {
			var tableId = players[socket.id].sittingOnTable;
			var activeSeat = tables[tableId].public.activeSeat;

			if( tables[tableId] && tables[tableId].seats[activeSeat].socket.id === socket.id && !tables[tableId].public.biggestBet && ['preflop','flop','turn','river'].indexOf(tables[tableId].public.phase) > -1 ) {
				// Validating the bet amount
				amount = parseFloat(parseFloat( amount ).toFixed(2));
				var adjustedAmount = amount - tables[tableId].seats[activeSeat].public.bet;
				if ( amount && isFinite( amount ) && amount <= tables[tableId].seats[activeSeat].public.chipsInPlay ) {
					// Checking amount is at least 1 bb or they are all in
					if( adjustedAmount >= tables[tableId].public.bigBlind || adjustedAmount == tables[tableId].seats[activeSeat].public.chipsInPlay ) {
						// Sending the callback first, because the next functions may need to send data to the same player, that shouldn't be overwritten
						callback( { 'success': true } );
						tables[tableId].playerBetted( amount ); 
						console.log('[' + moment().format() + '] (table ' + tableId + ')' + players[socket.id].public.name + ' bet ' + amount);
					}
				}
			}
		}
	});

	/**
	 * When a player raises
	 * @param function callback
	 */
	socket.on('raise', function( amount, callback ){
		if( !players[socket.id] === 'undefined' || typeof players[socket.id].public.name === 'undefined' ) return;

		if( typeof players[socket.id].sittingOnTable !== 'undefined' && players[socket.id].sittingOnTable !== null ) {
			var tableId = players[socket.id].sittingOnTable;
			var activeSeat = tables[tableId].public.activeSeat;
			
			if(
				// The table exists
				typeof tables[tableId] !== 'undefined' 
				// The player who should act is the player who raised
				&& tables[tableId].seats[activeSeat].socket.id === socket.id
				// The pot was betted 
				&& tables[tableId].public.biggestBet
				// It's not a round of blinds
				&& ['preflop','flop','turn','river'].indexOf(tables[tableId].public.phase) > -1
				// Not every other player is all in (in which case the only move is "call")
				&& !tables[tableId].otherPlayersAreAllIn()
				// Player should not be able to raise if someone went all in below biggestBet * 2
				&& !tables[tableId].playerAllInBelowBlind
			) {
				var actualRaise = 0;
				amount = parseFloat(parseFloat( amount ).toFixed(2)); // New biggest pot
				if ( amount && isFinite( amount ) ) {
					var curTable = tables[tableId];
					actualRaise = amount - curTable.seats[activeSeat].public.bet; // Additional amount being put into pot
					// Making sure raise is actually higher than current highest bet
					if( actualRaise <= curTable.seats[activeSeat].public.chipsInPlay && amount > curTable.public.biggestBet ) {
						// If user is all in
						if(actualRaise == curTable.seats[activeSeat].public.chipsInPlay)
						{
							if(amount < (curTable.public.biggestBet + curTable.public.raiseDifference)) {
								curTable.playerAllInBelowBlind = true;
							}

							callback( { 'success': true } );
							curTable.playerRaised( actualRaise );
							console.log('[' + moment().format() + '] (table ' + tableId + ')' + players[socket.id].public.name + ' raised ' + actualRaise);
						}
						else {
							if(actualRaise >= curTable.public.raiseDifference) {
								callback( { 'success': true } );
								curTable.playerRaised( actualRaise );
								console.log('[' + moment().format() + '] (table ' + tableId + ')' + players[socket.id].public.name + ' raised ' + actualRaise);
							}
						}
					}
				}
			}
		}
	});

	/**
	 * When a player decides between posting blinds or waiting for big blind
	 * @param option postBlinds or waitForBigBlind
	 */
	socket.on('updateSeatOption', function( option, callback ) {
		if( !players[socket.id] || typeof players[socket.id].public.name === 'undefined' ) return;

		if( typeof players[socket.id].sittingOnTable !== 'undefined' && players[socket.id].sittingOnTable !== null && typeof option !== 'undefined' ) {
			var tableId = players[socket.id].sittingOnTable;
			var currentPlayer = players[socket.id].public.seat;

			if( tables[tableId] && typeof tables[tableId].seats[currentPlayer] !== 'undefined' && tables[tableId].seats[currentPlayer].socket.id === socket.id ) {
				if(tables[tableId].seats[currentPlayer].public.waitingToSitIn) {
					if(option === 'postBlinds' || option === 'waitForBigBlind') {
						tables[tableId].seats[currentPlayer].seatOption = option;
						callback({'success': true, 'option': option});
					}
				}
			}
		}
	});

	socket.on('sitOutBigBlind', function( val, callback ) {
		if( !players[socket.id] || typeof players[socket.id].public.name === 'undefined' ) return;

		if(typeof val !== 'boolean') {
			callback( {'success': false} );
			return;
		};

		players[socket.id].sitOutBigBlind = val;
		callback( {'success': true} );
	});

	socket.on('sitOutNextHand', function( val, callback ) {
		if( !players[socket.id] || typeof players[socket.id].public.name === 'undefined' ) return;

		if(typeof val !== 'boolean') {
			callback( {'success': false} );
			return;
		};

		players[socket.id].sitOutNextHand = val;
		callback( {'success': true} );
	});

	socket.on('depositChips', function(depositAmount, callback) {
		if( !players[socket.id] || typeof players[socket.id].public.name === 'undefined' ) return; 

		var player = players[socket.id];
		var tableId = player.sittingOnTable;
		depositAmount = parseInt(depositAmount);
		if(typeof player !== 'undefined' &&
			tables[tableId].seats[player.public.seat].socket.id == socket.id &&
			depositAmount <= player.chips &&
			(depositAmount + player.public.chipsInPlay + player.public.bet) <= (tables[tableId].public.maxBuyIn) &&
			depositAmount >= tables[tableId].public.minBuyIn &&
			!isNaN(parseInt(depositAmount))  &&
			isFinite(parseInt(depositAmount))
		) {
			if(tables[tableId].public.gameIsOn && player.public.inHand) {
				player.depositChips = parseInt(depositAmount);
				callback( {'success': true, 'message': 'Chips will show next round'} );
				console.log('[' + moment().format() + '] (table ' + tableId + ')' + players[socket.id].public.name + ' bought ' + depositAmount + ' chips');
			} else {
				player.chips -= parseInt(depositAmount);
				player.public.chipsInPlay += parseInt(depositAmount);
				player.depositChips = null;
				callback( {'success': true, 'message': 'Chips deposited successfully'} );
				tables[tableId].emitEvent('table-data', tables[tableId].public);
				console.log('[' + moment().format() + '] (table ' + tableId + ')' + players[socket.id].public.name + ' bought ' + depositAmount + ' chips');
			}
		}
	});

	/**
	 * When a message from a player is sent
	 * @param string message
	 */
	socket.on('sendMessage', function( message ) {
		message = message.trim();
		if( message && players[socket.id].room ) {
			socket.broadcast.to( 'table-' + players[socket.id].room ).emit( 'receiveMessage', { 'message': htmlEntities( message ), 'sender': players[socket.id].public.name } );
		}
	});
});

/**
 * Event emitter function that will be sent to the table objects
 * Tables use the eventEmitter in order to send events to the client
 * and update the table data in the ui
 * @param string tableId
 */
var eventEmitter = function( tableId ) {
	return function ( eventName, eventData ) {
		io.sockets.in( 'table-' + tableId ).emit( eventName, eventData );
	}
}

/**
 * Changes certain characters in a string to html entities
 * @param string str
 */
function htmlEntities(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* GET TABLES */
Tables.find({active: true}, function(err, table) {
	if(err) {
		return console.log(err.red);
	}

	var i = 0;
	table.forEach((theTable) => {
		tables[i] = new Table(i, 
			theTable._id,
			theTable.Name, 
			theTable.Description, 
			theTable.startTime, 
			eventEmitter(i), 
			theTable.maxPlayers, 
			theTable.bigBlind, 
			theTable.smallBlind, 
			theTable.minPlayers, 
			theTable.maxBuyIn, 
			theTable.minBuyIn, 
			theTable.rakeTotal,
			theTable.rakeMinPreflopPot,
			theTable.rakePreflopPot,
			theTable.rakePostflopPercent,
			theTable.rakePostflopMax,
			theTable.timeBank,
			theTable.raiseBlinds,
			false);
		i++;
	});
});


/*      PASSPORT FUNCTIONS      */

function getUserByEmail(email, password, done) {
    User.findOne({
        email: email
    }, function(err, user) {
        
        if (err) return done(err, false, {message: "There was an error while trying to login. Please try again."});

        // User not found
		if (!user) return done(null, false, {message: "Invalid email address or password"});
		
		if(!user.active) return done(null, false, {message: "This account has been disabled"});
        
		// Invalid password
		user.comparePassword(password, function(err, isMatch) {
			if (err) return done(null, false, {message: "Invalid email address or password"});
			
			if(isMatch) {
				return done(null, user);
			}

			return done(null, false, {message: "Invalid email address or password"});
		});

     });
}

function checkAuthenticated(req, res, next) {
    if(req.isAuthenticated())
        return next();
	
	res.redirect('/login');
}

function checkNotAuthenticated(req, res, next) {
    if (!req.isAuthenticated())
        return next();

    res.redirect('/');
}

function checkIsAdmin(req, res, next) {
	if(req.isAuthenticated() && req.user.admin)
		return next();

	res.redirect('/');
}

var updateLobbyTables = function() {
	var lobbyTables = [];
	for ( var tableId in tables ) {
		// Sending the public data of the public tables to the lobby screen
		if( !tables[tableId].privateTable ) {
			lobbyTables[tableId] = {};
			lobbyTables[tableId].id = tables[tableId].public.id;
			lobbyTables[tableId].name = tables[tableId].public.name;
			lobbyTables[tableId].description = tables[tableId].public.description;
			lobbyTables[tableId].seatsCount = tables[tableId].public.seatsCount;
			lobbyTables[tableId].playersSeatedCount = tables[tableId].public.playersSeatedCount;
			lobbyTables[tableId].bigBlind = tables[tableId].public.bigBlind;
			lobbyTables[tableId].smallBlind = tables[tableId].public.smallBlind;
			lobbyTables[tableId].minPlayers = tables[tableId].public.minPlayers;
			lobbyTables[tableId].minBuyIn = tables[tableId].public.minBuyIn;
			lobbyTables[tableId].maxBuyIn = tables[tableId].public.maxBuyIn;

			try {
				lobbyTables[tableId].startTime = tables[tableId].public.startTime.toDateString();
			} catch {
				lobbyTables[tableId].startTime = "Error";
			}
		}
	}

	for(var i in players) {
		if(players[i] && players[i].socket !== null && players[i].room === null) {
			players[i].socket.emit('lobby-data', lobbyTables);
		}
	}
}