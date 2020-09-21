var Deck = require('./deck'),
	Pot = require('./pot'),
	User = require('../models/user'),
	Tables = require('../models/tables');

/**
 * The table "class"
 * @param string	id (the table id)
 * @param string	uid (database user id)
 * @param string	name (the name of the table)
 * @param string	description (description for the table)
 * @param datetime 	startTime (the time the table should start)
 * @param function 	eventEmitter (function that emits the events to the players of the room)
 * @param int 		seatsCount (the total number of players that can play on the table)
 * @param int 		bigBlind (the current big blind)
 * @param int 		smallBlind (the current smallBlind)
 * @param int		minPlayers (minimum players to start game)
 * @param int 		maxBuyIn (the maximum amount of chips that one can bring to the table)
 * @param int 		minBuyIn (the minimum amount of chips that one can bring to the table)
 * @param int		rakeMinPreflopPot (minimum pot has to be pre flop to collect rake)
 * @param int 		rakePreflopPot (amount to rake from pre flop if it meets minimum)
 * @param int 		rakePostflopPercent (Percent to take from pot post flop)
 * @param int 		rakePostflopMax (max rake to take post flop)
 * @param int 		timeBank (time bank to start users with)
 * @param bool 		privateTable (flag that shows whether the table will be shown in the lobby)
 */
var Table = function( id, uid, name, description, startTime, eventEmitter, seatsCount, bigBlind, smallBlind, minPlayers, maxBuyIn, minBuyIn, rakeTotal, rakeMinPreflopPot, rakePreflopPot, rakePostflopPercent, rakePostflopMax, timeBank, raiseBlinds, privateTable ) {
	// Database ID of table
	this.uid = uid;
	// The table is not displayed in the lobby
	this.privateTable = privateTable;
	// The number of players who receive cards at the begining of each round
	this.playersSittingInCount = 0;
	// The number of players that currently hold cards in their hands
	this.playersInHandCount = 0;
	// Reference to the last player that will act in the current phase (originally the dealer, unless there are bets in the pot)
	this.lastPlayerToAct = null;
	// The game has only two players
	this.headsUp = false;
	// References to all the player objects in the table, indexed by seat number
	this.seats = [];
	// The deck of the table
	this.deck = new Deck;
	// The function that emits the events of the table
	this.eventEmitter = eventEmitter;
	// Total rake of current game
	this.rakeTotal = rakeTotal;
	// Minimum pot pre-flop to take rake
	this.rakeMinPreflopPot = rakeMinPreflopPot;
	// How much to take if pre flop pot minimum reached
	this.rakePreflopPot = rakePreflopPot;
	// Percent of pot to take post flop
	this.rakePostflopPercent = rakePostflopPercent;
	// Maximum rake per hand
	this.rakePostflopMax = rakePostflopMax;
	// The pot with its methods
	this.pot = new Pot(this.rakeMinPreflopPot, this.rakePreflopPot, this.rakePostflopPercent, this.rakePostflopMax);
	// Handles timer for users
	this.turnTimer = null;
	// Time between action (seconds)
	this.phaseDelay = 1.2;
	// Time between showdown and new round
	this.endRoundDelay = 5;
	// Time delay between actions (ms)
	this.actionDelay = 750;
	// If player raised pot all in below 2x initial bet, only give option to call or fold
	this.playerAllInBelowBlind = false,
	// Time bank for players when they start
	this.timeBank = timeBank;
	// Timer that adds to players timebanks
	this.TimebankTimer = null;
	// Raise blinds
	this.raiseBlinds = raiseBlinds;
	// All the public table data
	this.public = {
		// The table id
		id: id,
		// The table name
		name: name,
		//The table description
		description: description,
		// When the table will start
		startTime: startTime,
		// The number of the seats of the table
		seatsCount: seatsCount,
		// The number of players that are currently seated
		playersSeatedCount: 0,
		// The big blind amount
		bigBlind: bigBlind,
		// The small blind amount
		smallBlind: smallBlind,
		// Minimum players to start the game
		minPlayers: minPlayers,
		// The minimum allowed buy in
		minBuyIn: minBuyIn,
		// The maximum allowed buy in
		maxBuyIn: maxBuyIn,
		// The amount of chips that are in the pot
		pot: this.pot.pots,
		// The biggest bet of the table in the current phase
		biggestBet: 0,
		// The smallest bet of the table in the current phase
		initialBet: 0,
		// the difference between the last raise/bet and most recent raise
		raiseDifference: 0,
		// The seat of the dealer
		dealerSeat: null,
		// The seat of the active player
		activeSeat: null,
		// The public data of the players, indexed by their seats
		seats: [],
		// The phase of the game ('smallBlind', 'bigBlind', 'preflop'... etc)
		phase: null,
		// The cards on the board
		board: ['', '', '', '', ''],		
		// Time per hand per-flop (seconds)
		preflopHandTime: 15,
		// Time per hand post-flop (seconds)
		handTime: 30,
		// Whether active seat should start timer
		startTimer: false,
		// The game has begun
		gameIsOn: false,
		// User is in timebank
		inTimebank: false,
		// Log of an action, displayed in the chat
		log: {
			message: '',
			seat: '',
			action: ''
		},
	};
	// Initializing the empty seats
	for( var i=0 ; i<this.public.seatsCount ; i++ ) {
		this.seats[i] = null;
	}
};

// The function that emits the events of the table
Table.prototype.emitEvent = function( eventName, eventData ){
	this.eventEmitter( eventName, eventData );
	this.log({
		message: '',
		action: '',
		seat: '',
		notification: ''
	});
};

/**
 * Finds the next player of a certain status on the table
 * @param  number offset (the seat where search begins)
 * @param  string|array status (the status of the player who should be found)
 * @return number|null
 */
Table.prototype.findNextPlayer = function( offset, status ) {
	offset = typeof offset !== 'undefined' ? offset : this.public.activeSeat;
	status = typeof status !== 'undefined' ? status : 'inHand';

	if( status instanceof Array ) {
		var statusLength = status.length;
		if( offset !== this.public.seatsCount ) {
			for( var i=offset+1 ; i<this.public.seatsCount ; i++ ) {
				if( this.seats[i] !== null ) {
					var validStatus = true;
					for( var j=0 ; j<statusLength ; j++ ) {
						validStatus &= !!this.seats[i].public[status[j]];
					}
					if( validStatus ) {
						return i;
					}
				}
			}
		}
		for( var i=0 ; i<=offset ; i++ ) {
			if( this.seats[i] !== null ) {
				var validStatus = true;
				for( var j=0 ; j<statusLength ; j++ ) {
					validStatus &= !!this.seats[i].public[status[j]];
				}
				if( validStatus ) {
					return i;
				}
			}
		}
	} else {
		if( offset !== this.public.seatsCount ) {
			for( var i=offset+1 ; i<this.public.seatsCount ; i++ ) {
				if( this.seats[i] !== null && this.seats[i].public[status] ) {
					return i;
				}
			}
		}
		for( var i=0 ; i<=offset ; i++ ) {
			if( this.seats[i] !== null && this.seats[i].public[status] ) {
				return i;
			}
		}
	}

	return null;
};

/**
 * Finds the previous player of a certain status on the table
 * @param  number offset (the seat where search begins)
 * @param  string|array status (the status of the player who should be found)
 * @return number|null
 */
Table.prototype.findPreviousPlayer = function( offset, status ) {
	offset = typeof offset !== 'undefined' ? offset : this.public.activeSeat;
	status = typeof status !== 'undefined' ? status : 'inHand';

	if( status instanceof Array ) {
		var statusLength = status.length;
		if( offset !== 0 ) {
			for( var i=offset-1 ; i>=0 ; i-- ) {
				if( this.seats[i] !== null ) {
					var validStatus = true;
					for( var j=0 ; j<statusLength ; j++ ) {
						validStatus &= !!this.seats[i].public[status[j]];
					}
					if( validStatus ) {
						return i;
					}
				}
			}
		}
		for( var i=this.public.seatsCount-1 ; i>=offset ; i-- ) {
			if( this.seats[i] !== null ) {
				var validStatus = true;
				for( var j=0 ; j<statusLength ; j++ ) {
					validStatus &= !!this.seats[i].public[status[j]];
				}
				if( validStatus ) {
					return i;
				}
			}
		}
	} else {
		if( offset !== 0 ) {
			for( var i=offset-1 ; i>=0 ; i-- ) {
				if( this.seats[i] !== null && this.seats[i].public[status] ) {
					return i;
				}
			}
		}
		for( var i=this.public.seatsCount-1 ; i>=offset ; i-- ) {
			if( this.seats[i] !== null && this.seats[i].public[status] ) {
				return i;
			}
		}
	}

	return null;
};

/**
 * Method that starts a new game
 */
Table.prototype.initializeRound = function( changeDealer ) {
	changeDealer = typeof changeDealer == 'undefined' ? true : changeDealer ;

	if( this.playersSittingInCount > 1 ) {
		// The game is on now
		if(!this.public.gameIsOn) {
			this.startTimebankTimer();

			// increment blinds
			if(this.raiseBlinds) {
				setInterval(() => {
					this.public.smallBlind += 10;
					this.public.bigBlind = this.public.smallBlind * 2;
				}, this.raiseBlinds * 60000);
			}
		}
		this.public.gameIsOn = true;
		this.public.board = ['', '', '', '', ''];
		this.deck.shuffle();
		this.playersInHandCount = 0;

		

		var biggestBet = 0;

		// Sit out players that have no chips
		for( var i=0 ; i<this.public.seatsCount ; i++ ) {
			// If a player is sitting on the current seat
			if( this.seats[i] !== null ) {
				if(this.seats[i].public.sittingIn) {
					if( !this.seats[i].public.chipsInPlay ) {
						this.seats[i].sitOut();
						this.playersSittingInCount--;
					} else {
						this.playersInHandCount++;
						this.seats[i].prepareForNewRound();
					}
				}
			}
		}

		// Player wants to post blinds, sit them in
		for(var i = 0; i < this.public.seatsCount ; i++)
		{
			if( this.seats[i] !== null  && !this.seats[i].public.sittingIn && this.seats[i].public.waitingToSitIn) {
				if( this.seats[i].seatOption === 'postBlinds' || this.playersSittingInCount < 2) {
					this.playerSatIn( i );
					this.seats[i].prepareForNewRound();
					this.seats[i].bet( this.public.bigBlind );
					this.playersInHandCount++;
					biggestBet = this.public.bigBlind;
				}
			}
		}
 

		// Giving the dealer button to a random player
		if( this.public.dealerSeat === null ) {
			var randomDealerSeat = Math.ceil( Math.random() * this.playersSittingInCount );
			var playerCounter = 0;
			var i = -1;

			// Assigning the dealer button to the random player
			while( playerCounter !== randomDealerSeat && i < this.public.seatsCount ) {
				i++;
				if( this.seats[i] !== null && this.seats[i].public.sittingIn ) {
					playerCounter++;
				}
			}
			this.public.dealerSeat = i;
		} else if( changeDealer || this.seats[this.public.dealerSeat].public.sittingIn === false ) {
			// If the dealer should be changed because the game will start with a new player
			// or if the old dealer is sitting out, give the dealer button to the next player
			this.public.dealerSeat = this.findNextPlayer( this.public.dealerSeat );
		}

		var bigBlindPlayerCandidate = this.findNextPlayer( this.findNextPlayer( this.public.dealerSeat ), 'name' );

		// Wait for big blind, sit in if they are
		if(this.seats[bigBlindPlayerCandidate] !== null) {
			if( !this.seats[bigBlindPlayerCandidate].public.sittingIn && this.seats[bigBlindPlayerCandidate].public.waitingToSitIn) {
				if( this.seats[bigBlindPlayerCandidate].seatOption === 'waitForBigBlind') {
					this.playerSatIn( bigBlindPlayerCandidate );
					this.seats[bigBlindPlayerCandidate].prepareForNewRound();
					this.seats[bigBlindPlayerCandidate].bet( this.public.bigBlind );
					this.playersInHandCount++;
					biggestBet = this.public.bigBlind;
				}
			}
		}

		this.headsUp = this.playersSittingInCount === 2;

		var bigBlindPlayer;
		if(this.playersSittingInCount === 2) {
			bigBlindPlayer = this.findNextPlayer ( this.public.dealerSeat );
		}
		else {
			bigBlindPlayer = this.findNextPlayer ( this.findNextPlayer ( this.public.dealerSeat ) );
		}

		// When user wants to sit out next big blind
		if(this.seats[bigBlindPlayer] !== null) {
			if(this.seats[bigBlindPlayer].public.sittingIn && this.seats[bigBlindPlayer].sitOutBigBlind) {
				this.seats[bigBlindPlayer].sitOut();
				this.playersSittingInCount--;
			}
		}
		
		this.headsUp = this.playersSittingInCount === 2;

		//reset biggest bet
		this.public.biggestBet = biggestBet;
		this.public.initialBet = biggestBet;
		this.public.raiseDifference = biggestBet;
		this.playerAllInBelowBlind = false;

		if( this.playersSittingInCount < 2 ) {
			this.stopGame();
		} else {
			this.initializeSmallBlind();
		}
	}
};

/**
 * Method that starts the "small blind" round
 */
Table.prototype.initializeSmallBlind = function() {
	// Set the table phase to 'smallBlind'
	this.public.phase = 'smallBlind';

	// If it's a heads up match, the dealer posts the small blind
	if( this.headsUp ) {
		this.public.activeSeat = this.public.dealerSeat;
	} else {
		this.public.activeSeat = this.findNextPlayer(this.public.dealerSeat ); // First user is after dealer chip
	}
	this.lastPlayerToAct = 10;
	this.playerPostedSmallBlind();
};

/**
 * Method that starts the "small blind" round
 */
Table.prototype.initializeBigBlind = function() {
	// Set the table phase to 'bigBlind'
	this.public.phase = 'bigBlind';
	this.actionToNextPlayer();
	this.playerPostedBigBlind();
};

/**
 * Method that starts the "preflop" round
 */
Table.prototype.initializePreflop = function() {
	// Set the table phase to 'preflop'
	this.public.phase = 'preflop';
	var currentPlayer = this.public.activeSeat;

	for( var i=0 ; i<this.playersInHandCount ; i++ ) {
		this.seats[currentPlayer].cards = this.deck.deal( 2 );
		this.seats[currentPlayer].public.hasCards = true;
		this.seats[currentPlayer].socket.emit( 'dealingCards', this.seats[currentPlayer].cards );

		this.seats[currentPlayer].evaluateHand( this.public.board );
		this.seats[currentPlayer].socket.emit('updateHandName', this.seats[currentPlayer].evaluatedHand.name);

		currentPlayer = this.findNextPlayer( currentPlayer );
	}

	this.actionToNextPlayer();
};

/**
 * Method that starts the next phase of the round
 */
Table.prototype.initializeNextPhase = function() {
	switch( this.public.phase ) {
		case 'preflop':
			this.public.phase = 'flop';
			this.public.board = this.deck.deal( 3 ).concat( ['', ''] );
			this.emitEvent( 'deal-cards', this.public.board );
			break;
		case 'flop':
			this.public.phase = 'turn';
			this.public.board[3] = this.deck.deal( 1 )[0];
			this.emitEvent( 'deal-cards', this.public.board );
			break;
		case 'turn':
			this.public.phase = 'river';
			this.public.board[4] = this.deck.deal( 1 )[0];
			this.emitEvent( 'deal-cards', this.public.board );
			break;
	}

	this.addTableBets( this.seats );
	this.public.biggestBet = 0;
	this.public.initialBet = 0;
	this.public.raiseDifference = 0;
	this.playerAllInBelowBlind = false;
	this.public.activeSeat = this.findNextPlayer( this.public.dealerSeat, ['chipsInPlay', 'inHand'] );
	this.lastPlayerToAct = this.findPreviousPlayer( this.public.activeSeat, ['chipsInPlay', 'inHand'] );

	// Update users hand names
	for( var i=0 ; i<this.public.seatsCount ; i++ ) {
		if( this.seats[i] !== null && this.seats[i].public.hasCards ) {
			this.seats[i].evaluateHand( this.public.board );
		
			this.seats[i].socket.emit('updateHandName', this.seats[i].evaluatedHand.name);
		}
		
	}

	this.emitEvent( 'table-data', this.public );

	// If all other players are all in, there should be no actions. Move to the next round.
	if( this.otherPlayersAreAllIn() ) {
		this.endPhase();
	} else {
		var that = this;
		setTimeout(() => { 
			that.seats[that.public.activeSeat].socket.emit('actNotBettedPot'); 
			that.startTurnTimer(that.public.handTime);
		}, that.actionDelay);
	}
};

/**
 * Making the next player the active one
 */
Table.prototype.actionToNextPlayer = function() {
	this.public.activeSeat = this.findNextPlayer( this.public.activeSeat, ['chipsInPlay', 'inHand'] );
	switch( this.public.phase ) {
		case 'preflop':
			if( this.otherPlayersAreAllIn() ) {
				this.seats[this.public.activeSeat].socket.emit( 'actOthersAllIn' );
			} else if( this.playerAllInBelowBlind ) {
				this.seats[this.public.activeSeat].socket.emit( 'playerAllInBelowBlind' );
			} else {
				this.seats[this.public.activeSeat].socket.emit( 'actBettedPot' );
			}
			break;
		case 'flop':
		case 'turn':
		case 'river':
			// If someone has bet
			if( this.public.biggestBet ) {
				if( this.otherPlayersAreAllIn() ) {
					this.seats[this.public.activeSeat].socket.emit( 'actOthersAllIn' );
				} else if( this.playerAllInBelowBlind ) {
					this.seats[this.public.activeSeat].socket.emit( 'playerAllInBelowBlind' );
				} else {
					this.seats[this.public.activeSeat].socket.emit( 'actBettedPot' );
				}
			} else {
				this.seats[this.public.activeSeat].socket.emit( 'actNotBettedPot' );
			}
			break;
	}

	// Start timer that is handling on server side
	if(['preflop', 'flop', 'turn', 'river'].indexOf(this.public.phase) > -1) {
		this.startTurnTimer(this.public.phase === 'preflop' ? this.public.preflopHandTime : this.public.handTime);
	}

	this.emitEvent( 'table-data', this.public );
};

/**
 * The phase when the players show their hands until a winner is found
 */
Table.prototype.showdown = function() {
	this.addTableBets( this.seats );
	var currentPlayer = this.findNextPlayer( this.public.dealerSeat );
	var bestHandRating = 0;

	for( var i=0 ; i<this.playersInHandCount ; i++ ) {
		this.seats[currentPlayer].evaluateHand( this.public.board );

		// If the hand of the current player is the best one yet,
		// he has to show it to the others in order to prove it
		if( this.seats[currentPlayer].evaluatedHand.rating >= bestHandRating ) {
			this.seats[currentPlayer].public.cards = this.seats[currentPlayer].cards;
			bestHandRating = this.seats[currentPlayer].evaluatedHand.rating;
		}

		currentPlayer = this.findNextPlayer( currentPlayer );
	}
	
	// Take rake
	var rake = this.pot.takeRake(this.public.phase);
	this.rakeTotal += rake;
	console.log("Rake taken: $" + rake + ". Total rake: " + this.rakeTotal);

	var messages = this.pot.distributeToWinners( this.seats, currentPlayer );
	var messagesCount = messages.length;
	var winners = [];

	for(var i = 0;i < messagesCount;i++)
	{
		var existingWinner = winners.find( ({ winner }) => winner == messages[i].winner); // messages[i].winner is seat #
		if(existingWinner) {
			existingWinner.winnings += messages[i].winnings
		} else {
			winners.push(messages[i]);
		}
	}

	for( var i=0 ; i < winners.length ; i++ ) {
		User.findByIdAndUpdate(this.seats[winners[i].winner].uid, {$inc: {wins: 1}}, function(err, res){
			if(err) {
				console.log("Error updating wins")
			}
		});

		this.seats[winners[i].winner].public.winnings = winners[i].winnings;
		this.public.activeSeat = winners[i].winner;
		var winMessage = this.seats[winners[i].winner].public.name + ' wins the pot (' + winners[i].winnings + ') with ' + winners[i].evaluatedHand;
		this.log({
			message: winMessage,
			action: '',
			seat: winners[i].winner,
			notification: 'Winner',
			winnerMsg: true,
		});
		this.emitEvent( 'table-data', this.public );
	}
	

	var that = this;

	setTimeout( function(){
		that.endRound();
	}, this.endRoundDelay * 1000 );
};

/**
 * Ends the current phase of the round
 */
Table.prototype.endPhase = function() {
	this.cancelTurnTimer();
	var that = this;
	switch( that.public.phase ) {
		case 'preflop':
		case 'flop':
		case 'turn':
			if(this.otherPlayersAreAllIn()) {
				this.showPlayersCards();
			}
			setTimeout(function() {
				that.initializeNextPhase();
			}, that.phaseDelay * 1000)
			break;
		case 'river':
			setTimeout(function() {
				that.showdown();
			}, that.phaseDelay * 1000)
			
			break;
	}
};

/**
 * When a player posts the small blind
 * @param int seat
 */
Table.prototype.playerPostedSmallBlind = function() {
	// So players who posted blinds to sit back in dont push more/less
	this.cancelTurnTimer();
	if(this.seats[this.public.activeSeat].public.bet == 0) {
		var bet = this.seats[this.public.activeSeat].public.chipsInPlay >= this.public.smallBlind ? this.public.smallBlind : this.seats[this.public.activeSeat].public.chipsInPlay;
		this.seats[this.public.activeSeat].bet( bet );
		this.log({
			message: this.seats[this.public.activeSeat].public.name + ' posted the small blind (' + this.public.smallBlind + ')',
			action: 'bet',
			seat: this.public.activeSeat,
			notification: 'Posted blind'
		});
		this.public.biggestBet = this.public.biggestBet < bet ? bet : this.public.biggestBet;
		this.emitEvent( 'table-data', this.public );
	}
	this.initializeBigBlind();
};

/**
 * When a player posts the big blind
 * @param int seat
 */
Table.prototype.playerPostedBigBlind = function() {
	// So user who posted blind put up more
	this.cancelTurnTimer();
	if( this.seats[this.public.activeSeat].public.bet == 0 ) {
		var bet = this.seats[this.public.activeSeat].public.chipsInPlay >= this.public.bigBlind ? this.public.bigBlind : this.seats[this.public.activeSeat].public.chipsInPlay;
		this.seats[this.public.activeSeat].bet( bet );
		this.log({
			message: this.seats[this.public.activeSeat].public.name + ' posted the big blind (' + this.public.bigBlind + ')',
			action: 'bet',
			seat: this.public.activeSeat,
			notification: 'Posted blind'
		});
		this.public.biggestBet = this.public.biggestBet < bet ? bet : this.public.biggestBet;
		
		this.emitEvent( 'table-data', this.public );
	}
	if(this.seats[this.public.activeSeat].public.chipsInPlay === 0) {
		this.lastPlayerToAct = this.findPreviousPlayer(this.public.activeSeat, ['chipsInPlay', 'inHand'])
	} else {
		this.lastPlayerToAct = this.public.activeSeat;
	}
	
	this.initializePreflop();
};

/**
 * Checks if the round should continue after a player has folded
 */
Table.prototype.playerFolded = function() {
	if(this.seats[this.public.activeSeat] === null || typeof this.seats[this.public.activeSeat] === 'undefined') return;

	this.seats[this.public.activeSeat].fold();
	this.log({
		message: this.seats[this.public.activeSeat].public.name + ' folded',
		action: 'fold',
		seat: this.public.activeSeat,
		notification: 'Folded'
	});
	this.emitEvent( 'table-data', this.public );

	this.cancelTurnTimer();

	// Update losses
	User.findByIdAndUpdate(this.seats[this.public.activeSeat].uid, {$inc: {losses: 1}}, function(err, res){
		if(err) {
			console.log("Error updating wins")
		}
	});

	this.playersInHandCount--;	
	this.pot.addPlayersBets( this.seats[this.public.activeSeat] );
	this.pot.removePlayer( this.public.activeSeat );

	// End the round
	if( this.playersInHandCount <= 1 ) {
		this.addTableBets( this.seats );
		var winnersSeat = this.findNextPlayer();
		
		// Take rake
		var rake = this.pot.takeRake(this.public.phase);
		this.rakeTotal += rake;
		console.log("Rake taken: $" + rake + ". Total rake: " + this.rakeTotal);

		var totalWinnings = this.pot.giveToWinner( this.seats[winnersSeat] );
		this.seats[winnersSeat].public.winnings = totalWinnings;

		this.log({
			message: this.seats[winnersSeat].public.name + ' has won the pot (' + totalWinnings + ')',
			action: '',
			seat: winnersSeat,
			notification: 'Winner',
			winnerMsg: true,
		});
		this.emitEvent( 'table-data', this.public );

		var that = this;
		setTimeout(function() {
			that.endRound()
		}, this.endRoundDelay * 1000);

		User.findByIdAndUpdate(that.seats[winnersSeat].uid, {$inc: {wins: 1}}, function(err, res){
			if(err) {
				console.log("Error updating wins")
			}
		});
	} else {
		if( this.lastPlayerToAct == this.public.activeSeat ) {
			this.endPhase();
		} else {
			var that = this;
			setTimeout(() => { that.actionToNextPlayer(); }, that.actionDelay);
		}
	}
};

/**
 * When a player checks
 */
Table.prototype.playerChecked = function() {
	if(this.seats[this.public.activeSeat] === null || typeof this.seats[this.public.activeSeat] === 'undefined') return;

	this.log({
		message: this.seats[this.public.activeSeat].public.name + ' checked',
		action: 'check',
		seat: this.public.activeSeat,
		notification: 'Checked'
	});
	this.emitEvent( 'table-data', this.public );
	this.cancelTurnTimer();
	if( this.lastPlayerToAct === this.public.activeSeat ) {
		this.endPhase();
	} else {
		var that = this;
		setTimeout(() => { that.actionToNextPlayer(); }, that.actionDelay);
	}
};

/**
 * When a player calls
 */
Table.prototype.playerCalled = function() {
	if(this.seats[this.public.activeSeat] === null || typeof this.seats[this.public.activeSeat] === 'undefined') return;

	var calledAmount = this.public.biggestBet - this.seats[this.public.activeSeat].public.bet;
	this.seats[this.public.activeSeat].bet( calledAmount );
	this.cancelTurnTimer();
	this.log({
		message: this.seats[this.public.activeSeat].public.name + ' called',
		action: 'call',
		seat: this.public.activeSeat,
		notification: 'Call'
	});
	this.emitEvent( 'table-data', this.public );

	if( this.lastPlayerToAct === this.public.activeSeat) {
		this.endPhase();
	} else {
		var that = this;
		setTimeout(() => { that.actionToNextPlayer(); }, that.actionDelay);
	}
};

/**
 * When a player bets
 */
Table.prototype.playerBetted = function( amount ) {
	if(this.seats[this.public.activeSeat] === null || typeof this.seats[this.public.activeSeat] === 'undefined') return;

	this.public.raiseDifference = amount - this.seats[this.public.activeSeat].public.bet;
	this.seats[this.public.activeSeat].bet( amount );
	this.public.biggestBet = this.public.biggestBet < this.seats[this.public.activeSeat].public.bet ? this.seats[this.public.activeSeat].public.bet : this.public.biggestBet;
	this.public.initialBet = amount;

	this.log({
		message: this.seats[this.public.activeSeat].public.name + ' bet ' + amount,
		action: 'bet',
		seat: this.public.activeSeat,
		notification: 'Bet ' + amount
	});
	this.emitEvent( 'table-data', this.public );
	this.cancelTurnTimer();
	var previousPlayerSeat = this.findPreviousPlayer(this.public.activeSeat, ['chipsInPlay', 'inHand']);
	if( previousPlayerSeat === this.public.activeSeat || previousPlayerSeat === null ) {
		this.endPhase();
	} else {
		this.lastPlayerToAct = previousPlayerSeat;
		var that = this;
		setTimeout(() => { that.actionToNextPlayer(); }, that.actionDelay);
	}
};

/**
 * When a player raises
 */
Table.prototype.playerRaised = function( amount ) {
	if(this.seats[this.public.activeSeat] === null || typeof this.seats[this.public.activeSeat] === 'undefined') return;
	
	this.seats[this.public.activeSeat].raise( amount ); 
	var oldBiggestBet = this.public.biggestBet;
	this.public.biggestBet = this.public.biggestBet < this.seats[this.public.activeSeat].public.bet ? this.seats[this.public.activeSeat].public.bet : this.public.biggestBet;
	var raiseAmount = this.public.raiseDifference = this.public.biggestBet - oldBiggestBet;

	this.log({
		message: this.seats[this.public.activeSeat].public.name + ' raised to ' + this.public.biggestBet,
		action: 'raise',
		seat: this.public.activeSeat,
		notification: 'Raise ' + raiseAmount
	});

	this.emitEvent( 'table-data', this.public );
	this.cancelTurnTimer();
	var previousPlayerSeat = this.findPreviousPlayer(this.public.activeSeat, ['chipsInPlay', 'inHand']);

	if( previousPlayerSeat === this.public.activeSeat || previousPlayerSeat === null ) {
		this.endPhase();
	} else {
		this.lastPlayerToAct = previousPlayerSeat;
		var that = this;
		setTimeout(() => { that.actionToNextPlayer(); }, that.actionDelay);
	}
};

/**
 * Adds the player to the table with their initial option
 * @param object 	player
 * @param int 		seat
 * @param int		chips
 * @param bool		waitForBigBlind
 */
Table.prototype.playerSatOnTheTable = function( player, seat, chips, waitForBigBlind ) {
	this.seats[seat] = player;
	this.public.seats[seat] = player.public;

	this.seats[seat].sitOnTable( this.public.id, seat, chips, this.timeBank );

	// Increase the counters of the table
	this.public.playersSeatedCount++;

	// If game has not started, just seat user, otherwise set options
	if( !this.public.gameIsOn ) {
		this.playerSatIn( seat );
	} else {
		if(waitForBigBlind) {
			this.seats[seat].seatOption = 'waitForBigBlind';
		} else {
			this.seats[seat].seatOption = 'postBlinds';
		}
		this.seats[seat].public.waitingToSitIn = true;

		this.log({
			message: this.seats[seat].public.name + ' sat at the table',
			action: '',
			seat: seat,
			notification: 'New Player'
		});
		this.emitEvent( 'table-data', this.public );
	}
};

Table.prototype.playerRequestSitIn = function( seat ) {
	if( !this.public.gameIsOn ) {
		this.playerSatIn( seat );
		return false;
	} else {
		this.seats[seat].seatOption = 'waitForBigBlind';
		this.seats[seat].public.waitingToSitIn = true;
		this.seats[seat].sitOutBigBlind = false;
		this.seats[seat].sitOutNextHand = false;
		this.emitEvent( 'table-data', this.public );

		return true;
	}
}

/**
 * Adds a player who is sitting on the table, to the game
 * @param int seat
 */
Table.prototype.playerSatIn = function( seat ) {
	this.log({
		message: this.seats[seat].public.name + ' sat at the table',
		action: '',
		seat: seat,
		notification: 'New Player'
	});
	this.emitEvent( 'table-data', this.public );

	// The player is sitting in
	this.seats[seat].public.sittingIn = true;
	this.seats[seat].public.waitingToSitIn = false;
	this.seats[seat].public.seatOption = null;

	this.playersSittingInCount++;
	
	this.emitEvent( 'table-data', this.public );

	this.seats[seat].socket.emit('timeBankUpdate', this.seats[seat].timeBank);

	// If there are no players playing right now, try to initialize a game with the new player
	if( !this.public.gameIsOn && this.playersSittingInCount >= this.public.minPlayers ) {
		// Initialize the game
		this.initializeRound( false );
	}
};

/**
 * Changes the data of the table when a player leaves
 * @param int seat
 */
Table.prototype.playerLeft = function( seat ) {
	this.log({
		message: this.seats[seat].public.name + ' has left the table',
		action: '',
		seat: '',
		notification: ''
	});

	// If someone is really sitting on that seat
	if( this.seats[seat].public.name ) {

		// If the player is sitting in, make them sit out first
		this.updatePlayerBalance(seat);
		if( this.seats[seat].public.sittingIn ) {
			this.playerSatOut( seat, true );
		}
		this.seats[seat].leaveTable();

		// Empty the seat
		this.public.seats[seat] = null;
		this.public.playersSeatedCount--;

		// If there are not enough players to continue the game
		if( this.public.playersSeatedCount < 2 ) {
			this.public.dealerSeat = null;
		}

		this.seats[seat] = null;
		this.emitEvent( 'table-data', this.public );

		// If a player left a heads-up match and there are people waiting to play, start a new round
		if( this.playersInHandCount < 2 ) {
			this.endRound();
		}
		// Else if the player was the last to act in this phase, end the phase
		else if( this.lastPlayerToAct === seat && this.public.activeSeat === seat ) {
			this.endPhase();
		}
	}
};

/**
 * Changes the data of the table when a player sits out
 * @param int 	seat 			(the numeber of the seat)
 * @param bool 	playerLeft		(flag that shows that the player actually left the table)
 */
Table.prototype.playerSatOut = function( seat, playerLeft ) {
	// Set the playerLeft parameter to false if it's not specified
	if( typeof playerLeft == 'undefined' ) {
		playerLeft = false;
	}

	// If the player didn't leave, log the action as "player sat out"
	if( !playerLeft ) {
		this.log({
			message: this.seats[seat].public.name + ' sat out',
			action: '',
			seat: '',
			notification: ''
		});
		this.emitEvent( 'table-data', this.public );
	}

	// If the player had betted, add the bets to the pot
	if( this.seats[seat].public.bet ) {
		this.pot.addPlayersBets( this.seats[seat] );
	}
	this.pot.removePlayer( this.public.activeSeat );

	this.playersSittingInCount--;

	if( this.seats[seat].public.inHand ) {
		this.seats[seat].sitOut();
		this.playersInHandCount--;

		if( this.playersInHandCount < 2 ) {
			if( !playerLeft ) {
				this.endRound();
			}
		} else {
			// If the player was not the last player to act but they were the player who should act in this round
			if( this.public.activeSeat === seat && this.lastPlayerToAct !== seat ) {
				var that = this;
				setTimeout(() => { that.actionToNextPlayer(); }, that.actionDelay);
			}
			// If the player was the last player to act and they left when they had to act
			else if( this.lastPlayerToAct === seat && this.public.activeSeat === seat ) {
				if( !playerLeft ) {
					this.endPhase();
				}
			}
			// If the player was the last to act but not the player who should act
			else if ( this.lastPlayerToAct === seat ) {
				var previousPlayer = this.findPreviousPlayer( this.lastPlayerToAct, ['chipsInPlay', 'inHand'] );
				if(previousPlayer === null) {
					this.endPhase();
				} else {
					this.lastPlayerToAct = previousPlayer;
				}
				
				
			}
		}
	} else {
		this.seats[seat].sitOut();
	}
	this.emitEvent( 'table-data', this.public );
};

Table.prototype.otherPlayersAreAllIn = function() {

	// Check if the players are all in
	var currentPlayer = this.public.activeSeat;
	var playersAllIn = 0;
	for( var i=0 ; i<this.playersInHandCount ; i++ ) {
		if( typeof this.seats[currentPlayer] !== 'undefined' && this.seats[currentPlayer].public.chipsInPlay === 0 ) {
			playersAllIn++;
		}
		currentPlayer = this.findNextPlayer( currentPlayer );
	}

	// In this case, all the players are all in. There should be no actions. Move to the next round.
	return playersAllIn >= this.playersInHandCount-1;
};

/**
 * Method that removes all cards from players
 */
Table.prototype.removeAllCardsFromPlay = function() {
	// For each seat
	for( var i=0 ; i<this.public.seatsCount ; i++ ) {
		// If a player is sitting on the current seat
		if( this.seats[i] !== null ) {
			this.seats[i].cards = [];
			this.seats[i].public.cards = [];
			this.seats[i].public.hasCards = false;
			this.seats[i].winnings = 0;
		}
	}
};

/**
 * Returns first available seat number
 * Returns -1 if its full
 */
Table.prototype.findAvailableSeat = function() {
	for(var i = 0; i < this.public.seatsCount;i++) {
		if(typeof this.seats[i] === 'undefined' || this.seats[i] == null) {
			return i;
		}
	}
	return -1;
};

Table.prototype.startTurnTimer = function( time ) {
	this.public.startTimer = time;
	this.public.inTimebank = false;
	var that = this;
	this.cancelTurnTimer();

	this.turnTimer = setTimeout(function() {
		that.playerAutoTurn();
	}, time * 1000);

	this.emitEvent('table-data', this.public);
	this.public.startTimer = false;
}

Table.prototype.cancelTurnTimer = function() {
	if(this.turnTimer !== null) {
		if(this.public.inTimebank) {
			clearInterval(this.turnTimer);
			this.public.inTimebank = false;
			this.seats[this.public.activeSeat].socket.emit('timeBankUpdate', this.seats[this.public.activeSeat].timeBank);
		} else {
			clearTimeout(this.turnTimer);
		}
	
		this.turnTimer = null;
	}
}

/**
 * When player runs out of time, automatically do their turn for them
 */
Table.prototype.playerAutoTurn = function() {
	if(typeof this.seats[this.public.activeSeat] === 'undefined' || !this.seats[this.public.activeSeat].socket) return;

	this.turnTimer = null;
	var curPlayer = this.seats[this.public.activeSeat];

	// If player has timebank, use it
	if(curPlayer.timeBank > 0) {
		this.public.inTimebank = true;

		this.public.startTimer = curPlayer.timeBank;
		this.emitEvent('table-data', this.public);
		this.public.startTimer = false;

		var that = this;
		this.turnTimer = setInterval( () => {
			curPlayer.timeBank--;
			curPlayer.socket.emit('timeBankUpdate', curPlayer.timeBank);

			if(curPlayer.timeBank == 0) {
				clearInterval(that.turnTimer);
				this.public.inTimebank = false;

				curPlayer.socket.emit('playerAutoTurn');

				if(that.public.phase == 'preflop') {
					that.playerSatOut( curPlayer.public.seat );
				}
				else if(that.public.biggestBet && curPlayer.public.bet < that.public.biggestBet) {
					that.playerFolded()
				} else {
					that.playerChecked();
				}
			}
		}, 1000 );

		return;
	} 

	curPlayer.socket.emit('playerAutoTurn');
	// If pot was raised, user needs to auto fold
	if(this.public.phase == 'preflop') {
		this.playerSatOut( curPlayer.public.seat );
	}
	else if(this.public.biggestBet && curPlayer.public.bet < this.public.biggestBet) {
		this.playerFolded()
	} else {
		this.playerChecked();
	}
}

// Every 60 minutes, add 30 to player timebanks, max 240
Table.prototype.startTimebankTimer = function() {
	var that = this;
	clearInterval(this.TimebankTimer);
	this.TimebankTimer = setTimeout(() => {
		for(var i = 0; i < this.public.seatsCount; i++) {
			if(that.seats[i] !== null ) {
				that.seats[i].timeBank += 30;
				if(that.seats[i].timeBank > 240) {
					that.seats[i].timeBank = 240;
				}
				this.seats[i].socket.emit('timeBankUpdate', this.seats[i].timeBank);
			}
		}
		this.startTimebankTimer();
	}, 3600000)
}

/**
 * Actions that should be taken when the round has ended
 */
Table.prototype.endRound = function() {
	// If there were any bets, they are added to the pot
	this.addTableBets( this.seats );

	if( !this.pot.isEmpty() ) {
		// Take rake
		var rake = this.pot.takeRake(this.public.phase);
		this.rakeTotal += rake;
		console.log("Rake taken: $" + rake + ". Total rake: " + this.rakeTotal);

		var winnersSeat = this.findNextPlayer( 0 );
		this.pot.giveToWinner( this.seats[winnersSeat] );
	}

	for( i=0 ; i<this.public.seatsCount ; i++ ) {
		if( this.seats[i] !== null ) {
			// Deposit chips for user
			if( this.seats[i].depositChips !== null ) {
				this.seats[i].chips -= this.seats[i].depositChips;
				this.seats[i].public.chipsInPlay += this.seats[i].depositChips;

				this.seats[i].depositChips = null;
			}

			// Sitting out the players who don't have chips
			if( this.seats[i].public.sittingIn ) {
				this.seats[i].prepareForNewRound(); // Gets rid of cards and other variables
				
				if(this.seats[i].public.chipsInPlay <= 0 || this.seats[i].sitOutNextHand) {
					this.seats[i].sitOut();
					this.playersSittingInCount--;
				}
			}

			this.updatePlayerBalance(i);
		}
	}

	this.saveRake();

	// If there are not enough players to continue the game, stop it
	if( this.playersSittingInCount < 2 ) {
		this.stopGame();
	} else {
		this.initializeRound();
	}
};

Table.prototype.showPlayersCards = function() {
	var currentPlayer = this.findNextPlayer( this.public.dealerSeat );
	for( var i=0 ; i<this.playersInHandCount ; i++ ) {
		this.seats[currentPlayer].public.cards = this.seats[currentPlayer].cards;
		currentPlayer = this.findNextPlayer( currentPlayer );
	}
	this.emitEvent( 'table-data', this.public );
};

Table.prototype.updatePlayerBalance = function( seat ) {
	if(seat !== null && this.seats[seat]) {
		var newUserBalance = this.seats[seat].chips + this.seats[seat].public.chipsInPlay;
		User.findByIdAndUpdate(this.seats[seat].uid, {$set:{balance: newUserBalance}}, function(err, object) {
			if(err) {
				console.log("Error updating user balance: " + err);
			}
		});
	}
}

Table.prototype.saveRake = function() {
	Tables.findByIdAndUpdate(this.uid, {$set:{rakeTotal: this.rakeTotal}}, function(err, table) {
		if(err) {
			console.log("Error updating table rake: " + err);
		}
	});
}

Table.prototype.save = function() {
	Tables.findByIdAndUpdate(this.uid, {$set:{
		'Name': this.public.name,
		'Description': this.public.description,
		'bigBlind': this.public.bigBlind,
		'smallBlind': this.public.smallBlind,
		'minBuyIn': this.public.minBuyIn,
		'maxBuyIn': this.public.maxBuyIn,
		'minPlayers': this.public.minPlayers,
		'maxPlayers': this.public.seatsCount,
		'startTime': this.public.startTime,
		'rakeMinPreflopPot': this.rakeMinPreflopPot,
		'rakePreflopPot': this.rakePreflopPot,
		'rakePostflopPercent': this.rakePostflopPercent,
		'rakePostflopMax': this.rakePostflopMax,
		'timeBank': this.timeBank,
		'rakeTotal': this.rakeTotal,
		'raiseBlinds': this.raiseBlinds
	}}, function(err, table){
		if(err) return false;
		
		return true;
	})
}

/**
 * Method that stops the game
 */
Table.prototype.stopGame = function() {
	this.public.phase = null;
	this.pot.reset();
	this.public.activeSeat = null;
	this.public.board = ['', '', '', '', ''];
	this.public.activeSeat = null;
	this.lastPlayerToAct = null;
	this.removeAllCardsFromPlay();
	this.public.gameIsOn = false;
	this.emitEvent( 'gameStopped', this.public );
	clearInterval(this.TimebankTimer);
};

Table.prototype.addTableBets = function( seats ) {
	this.pot.addTableBets( seats );
}

/**
 * Logs the last event
 */
Table.prototype.log = function(log) {
	this.public.log = null;
	this.public.log = log;
}

module.exports = Table;