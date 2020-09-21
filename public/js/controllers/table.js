
/**
 * The table controller. It keeps track of the data on the interface,
 * depending on the replies from the server.
 */
app.controller( 'TableController', ['$scope', '$rootScope', '$http', '$routeParams', '$timeout', '$interval', 'sounds',
function( $scope, $rootScope, $http, $routeParams, $timeout, $interval, sounds ) {
	$scope.table = {};
	$scope.notifications = [{},{},{},{},{},{},{},{},{},{}];
	$scope.showingChipsModal = false;
	$scope.actionState = '';
	$scope.table.dealerSeat = null;
	$scope.myCards = ['', ''];
	$scope.board = ['', '', '', '', ''];
	$scope.mySeat = null;
	$rootScope.sittingOnTable = null;
	$scope.turnTimer = null;
	$scope.betAmount = 0;
	$scope.seatOption = null;
	$scope.handName = '';
	$scope.tempHandName = ''; // So hand name updates when card is flipped
	$scope.sitOutBigBlindVal = false;
	$scope.sitOutNextHandVal = false;
	$scope.showDepositBox = false;
	$scope.chipsDeposited = null;
	$scope.depositMessage = null;
	$scope.timeBank = 0;
	$scope.gameLoaded = false;

	// Existing listeners should be removed
	socket.removeAllListeners();

	// Getting the table data
	$http({
		url: '/table-data/' + $routeParams.tableId,
		method: 'GET'
	}).success(function( data, status, headers, config ) {
		$scope.table = data.table;
		$scope.buyInAmount = data.table.maxBuyIn;

		if(typeof data.table.gameIsOn !== 'undefined' && data.table.gameIsOn === true)
		{
			var time = ['smallBlind', 'bigBling', 'preflop'].indexOf(data.table.phase) > -1 ? data.table.preflopHandTime : data.table.andTime;
			startTurnTimer(parseInt(data.table.activeSeat), parseInt(time));
		}
	});

	// Joining the socket room
	socket.emit( 'enterRoom', $routeParams.tableId, $rootScope.mySeat, $rootScope.buyInAmount, $rootScope.waitForBigBlind, function( response ) {
		if( response.success ){
			$rootScope.sittingOnTable = $routeParams.tableId;
			$rootScope.sittingIn = true;
			$scope.buyInError = null;
			$scope.mySeat = response.seat;
			$scope.actionState = 'waiting';
			$scope.table = response.table;

			$scope.seatOption = $rootScope.waitForBigBlind ? 'waitForBigBlind' : 'postBlinds';
			document.getElementById($scope.seatOption).checked = true;

			$scope.$digest();

			setTimeout(() => {
				setupCircle(10, ($("#table").width() / 2), ($("#table").height() / 2) + 20);
			}, 500)
		} else {
			if( response.error ) {
				$scope.buyInError = response.error;
			}
		}
	} );

	$scope.minBetAmount = function() {
		if( typeof $scope.table === 'undefined' || $scope.table === null || 
			$scope.mySeat === null || typeof $scope.table.seats[$scope.mySeat] === 'undefined' || $scope.table.seats[$scope.mySeat] === null ) return 0;

		if( $scope.actionState === "actBettedPot" ) {
			var proposedBet;
			if($scope.table.biggestBet > $scope.table.bigBlind) {
				proposedBet = $scope.table.biggestBet + $scope.table.raiseDifference;
			} else {
				proposedBet = $scope.table.bigBlind * 2;
			}
			return $scope.table.seats[$scope.mySeat].chipsInPlay < proposedBet ? $scope.table.seats[$scope.mySeat].chipsInPlay : proposedBet;
		} else {
			return $scope.table.seats[$scope.mySeat].chipsInPlay < $scope.table.bigBlind ? $scope.table.seats[$scope.mySeat].chipsInPlay : $scope.table.bigBlind;
		}
	}

	$scope.maxBetAmount = function() {
		if( typeof $scope.table === 'undefined' || $scope.table === null ||
			$scope.mySeat === null || typeof $scope.table.seats[$scope.mySeat] === 'undefined' || $scope.table.seats[$scope.mySeat] === null ) return 0;
		return $scope.actionState === "actBettedPot" ? $scope.table.seats[$scope.mySeat].chipsInPlay + $scope.table.seats[$scope.mySeat].bet : $scope.table.seats[$scope.mySeat].chipsInPlay;
	}

	$scope.callAmount = function() {
		if( typeof $scope.table === 'undefined' || $scope.table === null ||
			$scope.mySeat === null || typeof $scope.table.seats[$scope.mySeat] === 'undefined' || $scope.table.seats[$scope.mySeat] == null ) return 0;
		var callAmount = +$scope.table.biggestBet - $scope.table.seats[$scope.mySeat].bet;
		return callAmount > $scope.table.seats[$scope.mySeat].chipsInPlay ? $scope.table.seats[$scope.mySeat].chipsInPlay : callAmount;
	}

	$scope.showLeaveTableButton = function() {
		return $rootScope.sittingOnTable !== null && (!$rootScope.sittingIn || !$scope.table.gameIsOn);
	}

	$scope.showSitInButton = function() {
		return !$rootScope.sittingIn && $rootScope.sittingOnTable !== null && $scope.table.seats[$scope.mySeat].waitingToSitIn === false;
	}

	$scope.showPostSmallBlindButton = function() {
		return $scope.actionState === "actNotBettedPot" || $scope.actionState === "actBettedPot";
	}

	$scope.showPostBigBlindButton = function() {
		return $scope.actionState === "actNotBettedPot" || $scope.actionState === "actBettedPot";
	}

	$scope.showFoldButton = function() {
		return $scope.table.activeSeat === $scope.mySeat && ($scope.actionState === "actBettedPot" && $scope.table.biggestBet != $scope.table.seats[$scope.mySeat].bet) || $scope.actionState === "actOthersAllIn" || $scope.actionState === "playerAllInBelowBlind";
	}

	$scope.showCheckButton = function() {
		return $scope.table.activeSeat === $scope.mySeat && ($scope.actionState === "actNotBettedPot" || ($scope.actionState === "actOthersAllIn" && $scope.callAmount() === 0) || ( $scope.actionState === "actBettedPot" && $scope.table.biggestBet === $scope.table.seats[$scope.mySeat].bet ));
	}

	$scope.showCallButton = function() {
		return $scope.table.activeSeat === $scope.mySeat && (($scope.actionState === "actOthersAllIn" && $scope.callAmount() > 0) || $scope.actionState === "playerAllInBelowBlind" || ($scope.actionState === "actBettedPot" && $scope.table.biggestBet !== $scope.table.seats[$scope.mySeat].bet) );
	}

	$scope.showBetButton = function() {
		return $scope.table.activeSeat === $scope.mySeat && ($scope.actionState === "actNotBettedPot" && $scope.table.seats[$scope.mySeat].chipsInPlay && $scope.table.biggestBet < $scope.table.seats[$scope.mySeat].chipsInPlay);
	}

	$scope.showRaiseButton = function() {
		return $scope.table.activeSeat === $scope.mySeat && ($scope.actionState === "actBettedPot" && $scope.table.seats[$scope.mySeat].chipsInPlay && $scope.table.biggestBet < $scope.table.seats[$scope.mySeat].chipsInPlay);
	}

	$scope.showBetRange = function() {
		return $scope.table.activeSeat === $scope.mySeat && (($scope.actionState === "actNotBettedPot" || $scope.actionState === "actBettedPot") && $scope.table.seats[$scope.mySeat].chipsInPlay && $scope.table.biggestBet < $scope.table.seats[$scope.mySeat].chipsInPlay);
	}

	$scope.showBetInput = function() {
		return $scope.table.activeSeat === $scope.mySeat && (($scope.actionState === "actNotBettedPot" || $scope.actionState === "actBettedPot")  && $scope.table.seats[$scope.mySeat].chipsInPlay && $scope.table.biggestBet < $scope.table.seats[$scope.mySeat].chipsInPlay);
	}

	$scope.showTimebank = function() {
		if($scope.table.activeSeat !== $scope.mySeat) return false;
		return ($scope.table.activeSeat === $scope.mySeat && $scope.timeBank > 0 && (parseInt(document.getElementById('timer-text-' + $scope.mySeat).innerText) <= 10 || $scope.table.inTimebank));
	}

	$scope.showBet3x = function() {
		var proposedBet = 3 * $scope.table.bigBlind;
		return $scope.showBetRange() && $scope.table.phase === 'preflop' && proposedBet >= $scope.minBetAmount() && proposedBet <= $scope.maxBetAmount();
	}

	$scope.showBet5x = function() {
		var proposedBet = 5 * $scope.table.bigBlind;
		return $scope.showBetRange() && $scope.table.phase === 'preflop' && proposedBet >= $scope.minBetAmount() && proposedBet <= $scope.maxBetAmount();
	}

	$scope.showBetHalfPot = function() {
		var proposedBet = parseInt(0.5 * $scope.totalPot());
		return $scope.showBetRange() && $scope.table.phase !== 'preflop' && proposedBet >= $scope.minBetAmount() && proposedBet <= $scope.maxBetAmount();
	}

	$scope.showBet4thsPot = function() {
		var proposedBet = parseInt(0.75 * $scope.totalPot());
		return $scope.showBetRange() && $scope.table.phase !== 'preflop' && proposedBet >= $scope.minBetAmount() && proposedBet <= $scope.maxBetAmount();
	}

	$scope.showBetPot = function() {
		var proposedBet = $scope.totalPot();
		return $scope.showBetRange() && proposedBet >= $scope.minBetAmount() && proposedBet <= $scope.maxBetAmount();
	}

	$scope.showCheckNextHand = function() {
		return $scope.table.seats[$scope.mySeat] !== null && $scope.table.biggestBet === 0 || $scope.table.biggestBet === $scope.table.seats[$scope.mySeat].bet;
	}

	$scope.showCallNextHand = function() {
		return $scope.table.seats[$scope.mySeat] !== null && $scope.table.biggestBet > 0 && $scope.table.biggestBet > $scope.table.seats[$scope.mySeat].bet;
	}

	$scope.betHalfPot = function() {
		$scope.betAmount = parseInt(0.5 * $scope.totalPot());
		$scope.$digest();
	}

	$scope.bet4thsPot = function() {
		$scope.betAmount = parseInt(0.75 * $scope.totalPot());
		$scope.$digest();
	}

	$scope.increaseBet = function() {
		var minBet = $scope.minBetAmount();
		var maxBet = $scope.table.seats[$scope.mySeat].chipsInPlay + $scope.table.seats[$scope.mySeat].bet;
		var proposedAmount = parseFloat($scope.betAmount) + ($scope.table.raiseDifference > 0 ? $scope.table.raiseDifference : minBet);

		$scope.betAmount = proposedAmount <= maxBet ? proposedAmount : maxBet;
	}

	$scope.decreaseBet = function() {
		var minBet = $scope.minBetAmount();
		var proposedAmount = parseFloat($scope.betAmount) - ($scope.table.raiseDifference > 0 ? $scope.table.raiseDifference : minBet);
		$scope.betAmount = proposedAmount >= minBet ? proposedAmount : minBet;
	}

	$scope.getBetAmount = function() {
		return parseFloat($scope.betAmount);
	}

	$scope.potText = function() {
		if( typeof $scope.table.pot !== 'undefined' && ($scope.table.pot[0].amount > 0 || $scope.table.pot.length > 1) ) {
			var potText = 'Pot: ' + $scope.table.pot[0].amount;

			var potCount = $scope.table.pot.length;
			if( potCount > 1 ) {
				for( var i=1 ; i<potCount ; i++ ) {
					if($scope.table.pot[i].amount > 0) {
						potText += ' - Sidepot: ' + $scope.table.pot[i].amount;

					}
				}
			}
			return potText;
		}
	}

	$scope.totalPot = function() {
		if( typeof $scope.table.pot !== 'undefined' && ($scope.table.pot[0].amount > 0 || $scope.table.pot.length > 1) ) {
			var totalPot = 0;
			for( var i=0 ; i < $scope.table.pot.length ; i++ ) {
				if($scope.table.pot[i].amount > 0) {
					totalPot += $scope.table.pot[i].amount;
				}
			}
			return totalPot;
		}

		return 0;
	}

	$scope.getCardClass = function( seat, card ) {
		if( $scope.mySeat === seat ) {
			return $scope.myCards[card];
		}
		else if ( typeof $scope.table.seats !== 'undefined' && typeof $scope.table.seats[seat] !== 'undefined' && $scope.table.seats[seat] && typeof $scope.table.seats[seat].cards !== 'undefined' && typeof $scope.table.seats[seat].cards[card] !== 'undefined' ) {
			return 'card-face-' + $scope.table.seats[seat].cards[card];
		}
		else {
			return 'card-back';
		}
	}

	$scope.seatOccupied = function( seat ) {
		return !$rootScope.sittingOnTable || ( $scope.table.seats !== 'undefined' && typeof $scope.table.seats[seat] !== 'undefined' && $scope.table.seats[seat] && $scope.table.seats[seat].name );
	}

	// Leaving the socket room
	$scope.leaveRoom = function() {
		socket.emit( 'leaveRoom' );
	};

	// Sit in the game
	$scope.sitIn = function() {
		socket.emit( 'sitIn', function( response ) {
			if( response.success ) {
				if(response.waitingToSitIn) {
					$scope.actionState = 'waiting';
					$scope.seatOption = 'waitForBigBlind';
					$scope.sitOutNextHandVal = false;
					$scope.sitOutBigBlindVal = false;
					$scope.$digest();
					document.getElementById('postBlinds').checked = false;
					document.getElementById('waitForBigBlind').checked = true;
				} else {
					$rootScope.sittingIn = true;
					$scope.sitOutNextHandVal = false;
					$scope.sitOutBigBlindVal = false;
					$rootScope.$digest();
				}
			}
		});
	}

	// Leave the table (not the room)
	$scope.leaveTable = function() {
		socket.emit( 'leaveTable', function( response ) {
			if( response.success ) {
				$rootScope.sittingOnTable = null;
				$rootScope.totalChips = response.totalChips;
				$rootScope.sittingIn = false;
				$scope.actionState = '';
				$scope.myCards = ['', ''];
				$rootScope.$digest();
				$scope.$digest();
			}
		});
	}

	// Post a blind (or not)
	$scope.postBlind = function( posted ) {
		socket.emit( 'postBlind', posted, function( response ) {
			if( response.success && !posted ) {
				$rootScope.sittingIn = false;
			} else {
				sounds.playBetSound();
			}
			$scope.actionState = '';
			$scope.$digest();
			
			$interval.cancel($scope.turnTimer);
			$scope.turnTimer = null;
		});
	}

	$scope.check = function() {
		socket.emit( 'check', function( response ) {
			if( response.success ) {
				sounds.playCheckSound();
				$scope.actionState = '';
				$scope.$digest();

				$interval.cancel($scope.turnTimer);
				$scope.turnTimer = null;
			}
		});

		$scope.callNextHand = false;
		$scope.checkNextHand = false;
		$scope.foldNextHand = false;
	}

	$scope.fold = function() {
		socket.emit( 'fold', function( response ) {
			if( response.success ) {
				sounds.playFoldSound();
				$scope.actionState = '';
				$scope.$digest();
				
				$interval.cancel($scope.turnTimer);
				$scope.turnTimer = null;
			}
		});

		$scope.callNextHand = false;
		$scope.checkNextHand = false;
		$scope.foldNextHand = false;
	}

	$scope.call = function() {
		socket.emit( 'call', function( response ) {
			if( response.success ) {
				sounds.playCallSound();
				$scope.actionState = '';
				$scope.$digest();
				
				$interval.cancel($scope.turnTimer);
				$scope.turnTimer = null;
			}
		});

		$scope.callNextHand = false;
		$scope.checkNextHand = false;
		$scope.foldNextHand = false;
	}

	$scope.bet = function() {
		socket.emit( 'bet', $scope.betAmount, function( response ) {
			if( response.success ) {
				sounds.playBetSound();
				$scope.actionState = '';
				$scope.$digest();
				
				$interval.cancel($scope.turnTimer);
				$scope.turnTimer = null;
			}
		});

		$scope.callNextHand = false;
		$scope.checkNextHand = false;
		$scope.foldNextHand = false;
	}

	$scope.raise = function() {
		socket.emit( 'raise', $scope.betAmount, function( response ) {
			if( response.success ) {
				sounds.playRaiseSound();
				$scope.actionState = '';
				$scope.$digest();
				
				$interval.cancel($scope.turnTimer);
				$scope.turnTimer = null;
			}
		});

		$scope.callNextHand = false;
		$scope.checkNextHand = false;
		$scope.foldNextHand = false;
	}

	$scope.updateSeatOption = function( option ) {
		socket.emit( 'updateSeatOption', option, function( response ) {
			if( response.success ) {
				$scope.seatOption = response.option;

				if(response.option == 'postBlinds') {
					document.getElementById('waitForBigBlind').checked = false;
				} else {
					document.getElementById('postBlinds').checked = false;
				}

				$scope.$digest();
			}
		});
	}

	$scope.getSeat = function( offset ) {
		var proposedSeat = $rootScope.mySeat + offset;
		if(proposedSeat >= $rootScope.seatsCount) {
			proposedSeat -= $rootScope.seatsCount;
		}
		return proposedSeat;
	}

	$scope.sitOutBigBlind = function() {
		socket.emit('sitOutBigBlind', !$scope.sitOutBigBlindVal, function( response ) {
			if(response.success === false) {
				$scope.sitOutBigBlindVal == !$scope.sitOutBigBlindVal;
			}
		});
	}

	$scope.sitOutNextHand = function() {
		socket.emit('sitOutNextHand', !$scope.sitOutNextHandVal, function( response ) {
			if(response.success === false) {
				$scope.sitOutNextHandVal == !$scope.sitOutNextHandVal;
			}
		})
	}

	$scope.depositBox = function() {
		$scope.showDepositBox = !$scope.showDepositBox;
		$scope.chipsDeposited = null;
		$scope.depositMessage = null;
	}

	$scope.getMaxDeposit = function() {
		if(!$scope.showDepositBox) return 'N/A';

		var maxDeposit = $scope.table.maxBuyIn - $scope.table.seats[$scope.mySeat].chipsInPlay - $scope.table.seats[$scope.mySeat].bet;
		var availableBalance = ($scope.totalChips - $rootScope.buyInAmount);
		var resultDeposit = maxDeposit > availableBalance ? availableBalance : maxDeposit
		return resultDeposit >= $scope.table.minBuyIn ? resultDeposit : 'N/A';
	}

	$scope.getMinDeposit = function() {
		if(!$scope.showDepositBox) return 'N/A';

		var minDeposit = $scope.table.minBuyIn + $scope.table.seats[$scope.mySeat].chipsInPlay + $scope.table.seats[$scope.mySeat].bet;
		var availableBalance = ($scope.totalChips - $rootScope.buyInAmount);
		return availableBalance >= $scope.table.minBuyIn && minDeposit <= $scope.table.maxBuyIn ? $scope.table.minBuyIn : 'N/A';
	}

	$scope.depositChips = function() {
		socket.emit('depositChips', $scope.depositAmount, function( response ) {
			if(response.success) {
				$scope.totalChips -= $scope.depositAmount;
				$scope.chipsDeposited = $scope.depositAmount;
				$scope.depositMessage = response.message;
				$scope.$digest();
			} else {
				document.getElementById('desositAmountTxt').style.border = '1px solid #ff0000';
			}
		});
	}

	var startTurnTimer = function(seat, time) {
		// Cancel any previously existing timers
		if($scope.turnTimer != null) {
			$interval.cancel($scope.turnTimer);
		}

		var startTimeCounter = time;

		// Start timer  from the beginning
		document.getElementById('timer-text-' + seat).innerText = startTimeCounter;
		document.getElementById('player-timer-' + seat).style.width = '100%';

		// Decrement every second
		$scope.turnTimer = $interval(function() {
			startTimeCounter--;
			// Set new width and update timer
			var widthPercentage = ((startTimeCounter / time) * 100);
			document.getElementById('timer-text-' + seat).innerText = (startTimeCounter);
			document.getElementById('player-timer-' + seat).style.width = widthPercentage + '%';

			// If its 0, stop interval
			if(startTimeCounter == 0)
			{
				$interval.cancel($scope.turnTimer);
				$scope.turnTimer = null;
				document.getElementById('timer-text-' + seat).innerText = '';
			}
		}, 1000);
	};

	socket.on( 'deal-cards', function( data ) {
		if( data ) {
			var timer = 0;
			for( var i = 0; i < 5;i++ ) {
				if(data[i] !== '' && $scope.board[i] === '') {
					addCard(i, ++timer);
				}
			}
		}
		
		function addCard(i, timer) {
			// Show card
			setTimeout(() => {
				$scope.board[i] = data[i];
				$scope.$digest();
			}, timer * 200);

			// Flip card
			setTimeout(() => {
				$("#card-" + i).flip(true);
				$scope.handName = $scope.tempHandName;
			}, 750);
		}
	} );

	// When the table data have changed
	socket.on( 'table-data', function( data ) {
		$scope.table = data;
		switch ( data.log.action ) {
			case 'fold':
				sounds.playFoldSound();
				$interval.cancel($scope.turnTimer);
				$scope.turnTimer = null;
				break;
			case 'check':
				sounds.playCheckSound();
				$interval.cancel($scope.turnTimer);
				$scope.turnTimer = null;
				break;
			case 'call':
				sounds.playCallSound();
				$interval.cancel($scope.turnTimer);
				$scope.turnTimer = null;
				break;
			case 'bet':
				sounds.playBetSound();
				$interval.cancel($scope.turnTimer);
				$scope.turnTimer = null;
				$scope.callNextHand = false;
				break;
			case 'raise':
				sounds.playRaiseSound();
				$interval.cancel($scope.turnTimer);
				$scope.turnTimer = null;
				$scope.callNextHand = false;
				break;
		}

		if( data.log.message ) {
			var messageBox = document.querySelector('#messages');
			var messageElement = angular.element( '<div class="messages"><p class="log-message">' + data.log.message + '</p></div>' );
			angular.element(messageBox).append(messageElement);
			setTimeout(() => {
				messageElement.remove();
			}, (typeof data.log.winnerMsg !== undefined && data.log.winnerMsg ? 5500 : 3500));

			messageBox.scrollTop = messageBox.scrollHeight;
			if(data.log.notification && data.log.seat !== '') {
				if(!$scope.notifications[data.log.seat].message) {
					$scope.notifications[data.log.seat].message = data.log.notification;
					$scope.notifications[data.log.seat].timeout = $timeout(function() {
						$scope.notifications[data.log.seat].message = '';
					}, (typeof data.log.winnerMsg !== undefined && data.log.winnerMsg ? 4000 : 1200));
				} else {
					$timeout.cancel($scope.notifications[data.log.seat].timeout);
					$scope.notifications[data.log.seat].message = data.log.notification;
					$scope.notifications[data.log.seat].timeout = $timeout(function() {
						$scope.notifications[data.log.seat].message = '';
					}, (typeof data.log.winnerMsg !== undefined && data.log.winnerMsg ? 4000 : 1200));
				}
			}
		}

		// Board Animations for board cards
		if(data.board[0] === '') {
			$scope.board = data.board;
			for( var i = 0; i < 5; i++ ) {
				$("#card-" + i).flip(false);
			}
		} else if($scope.board[0] === '' && data.board[0] !== '' && !data.seats[$scope.mySeat].inHand) {
			$scope.board = data.board;
			setTimeout( () => {
				for( var i = 0; i < 5; i++ ) {
					if($scope.board[i] !== '') {
						$("#card-" + i).flip(true);
					}
				}
			}, 400);
		}

		$rootScope.sittingIn = data.seats[$scope.mySeat].sittingIn;
		$scope.$digest();

		if(data.activeSeat === $scope.mySeat) {
			if($scope.callNextHand) {
				$scope.call();
			} else if($scope.checkNextHand) {
				$scope.check();
			} else if($scope.foldNextHand) {
				$scope.fold();
			}

			$scope.callNextHand = false;
			$scope.checkNextHand = false;
			$scope.foldNextHand = false;
		}

		// Showing other players cards when necessary
		for(var i = 0; i < $scope.table.seatsCount;i++) {
			if( $scope.table.seats[i] && i !== $scope.mySeat ) {
				if($scope.table.seats[i].cards.length == 2) {
					if( !$("#player-cards-" + i + " .card-container").data("flip-model").isFlipped ) {
						$("#player-cards-" + i + " .card-container").flip(true);
					}
				} else if( $("#player-cards-" + i + " .card-container").data("flip-model").isFlipped ) {
					$("#player-cards-" + i + " .card-container").flip(false);
				}
			}
		}

		// Once players are loaded, place players correctly
		if(!$scope.gameLoaded) {
			$scope.gameLoaded = true;
			setTimeout(() => {
				setupCircle(10, ($("#table").width() / 2), ($("#table").height() / 2) + 20);
			}, 500)
		}

		// Start player timer, could = 0 so check for false
		if(data.startTimer !== false)
		{
			startTurnTimer(data.activeSeat, parseInt(data.startTimer));
		}
	});

	// When the game has stopped
	socket.on( 'gameStopped', function( data ) {
		$scope.table = data;
		$scope.actionState = 'waiting';
		$rootScope.sittingIn = data.seats[$scope.mySeat].sittingIn;
		$scope.board = ['', '', '', '', ''];
		$scope.$digest();
	});

	// When the player is asked to place the small blind
	socket.on( 'postSmallBlind', function( data ) {
		$scope.actionState = 'postSmallBlind';
		$scope.$digest();
	});

	// When the player is asked to place the big blind
	socket.on( 'postBigBlind', function( data ) {
		$scope.actionState = 'postBigBlind';
		$scope.$digest();
	});

	// When the player is dealt cards
	socket.on( 'dealingCards', function( cards ) {
		$("#player-cards-" + $scope.mySeat + " .card-container").flip(false);
		$scope.myCards[0] = 'card-face-'+cards[0];
		$scope.myCards[1] = 'card-face-'+cards[1];
		$scope.$digest();
		setTimeout(() => {
			$("#player-cards-" + $scope.mySeat + " .card-container").flip(true);
		}, 400)
	});

	// When the user is asked to act and the pot was betted
	socket.on( 'actBettedPot', function() {
		$scope.actionState = 'actBettedPot';
		sounds.playAttentionSound();

		$scope.betAmount = $scope.minBetAmount();
		$scope.$digest();
	});

	// When the user is asked to act and the pot was not betted
	socket.on( 'actNotBettedPot', function() {
		$scope.actionState = 'actNotBettedPot';
		sounds.playAttentionSound();

		$scope.betAmount = $scope.table.seats[$scope.mySeat].chipsInPlay < $scope.table.bigBlind ? $scope.table.seats[$scope.mySeat].chipsInPlay : $scope.table.bigBlind;
		$scope.$digest();
	});

	// When the user is asked to call an all in
	socket.on( 'actOthersAllIn', function() {
		$scope.actionState = 'actOthersAllIn';
		sounds.playAttentionSound();
		$scope.$digest();
	});

	socket.on( 'playerAllInBelowBlind', function() {
		$scope.actionState = 'playerAllInBelowBlind';
		sounds.playAttentionSound();
		
		$scope.$digest();
	});

	socket.on( 'playerAutoTurn', function() {
		if($scope.actionState == 'postBigBlind' || $scope.actionState == 'postSmallBlind') {
			$rootScope.sittingIn = false;
		}
		$scope.actionState = '';
		$scope.$digest();
	});

	socket.on( 'updateHandName', function( handName ) {
		// Capitalize first letter
		if(['bigBlind', 'smallBlind'].indexOf($scope.table.phase) === -1) {
			$scope.tempHandName = handName.charAt(0).toUpperCase() + handName.slice(1);
		} else {
			$scope.handName = handName.charAt(0).toUpperCase() + handName.slice(1);
			$scope.$digest();
		}
	});

	socket.on( 'timeBankUpdate', function( timeBank ) {
		$scope.timeBank = timeBank;
		$scope.$digest();
	});

	var theta = [];
	// 10 seats
	var frags = (Math.PI * 2) / 10;
	for (var i = 0; i < 10; i++) {
		theta.push(((3/2) * Math.PI) - (frags * i));
	}

	var setupCircle = function(n, rx, ry) {
		var x = $("#table").offset().left + ($("#table").width()/2);
		var y = $("#table").offset().top + ($("#table").height()/2);
		$("#circle-holder").css({"left": x, "top": y});

		var circleArray = [];
		var betsArray = [];
		var dealerArray = [];
		for (var i = 0; i < n; i++) {
			var circle = document.getElementById('player-' + i);
			var bets = document.getElementById('bets-' + i);
			var dealer = document.getElementById('dealer-wrap-' + i);
			circleArray.push(circle);
			betsArray.push(bets);
			dealerArray.push(dealer);
			
			circleArray[i].style.position = "absolute";
			circleArray[i].style.bottom = (Math.round(ry * Math.sin(theta[i]))) + 'px';

			betsArray[i].style.position = "absolute";
			dealerArray[i].style.position = "absolute";

			if(i > 2 && i < 7) {
				betsArray[i].style.top = (80 * Math.sin(theta[i])) + 'px';
				dealerArray[i].style.top = (80 * Math.sin(theta[i])) + 'px';
			} else {
				betsArray[i].style.bottom = -(125 * Math.sin(theta[i])) + 'px';
				dealerArray[i].style.bottom = -(122 * Math.sin(theta[i])) + 'px';
			}

			betsArray[i].style.left = -(125 * Math.cos(theta[i])) + 'px';
			dealerArray[i].style.left = -(150 * Math.cos(theta[i])) + 'px';

			if( i == 0 || i == 5 ) {
				circleArray[i].style.left = (Math.round(rx * Math.cos(theta[i])) - 95) + 'px';
				if( i == 5) {
					circleArray[i].style.bottom = (Math.round(ry * Math.sin(theta[i])) - 20) + 'px';
				}
			}
			else if( $(window).width() < 1200 && i < 5 ) {
				circleArray[i].style.left = (Math.round(rx * Math.cos(theta[i]))  - ($("#player-" + i).width()/2)) + 'px';
			} else if( i < 5 ) {
				circleArray[i].style.left = (Math.round(rx * Math.cos(theta[i])) - $("#player-" + i).width()) + 'px';
			} else if( $(window).width() < 1200 && i >= 5 ) {
				circleArray[i].style.left = (Math.round(rx * Math.cos(theta[i])) - 100) + 'px';
				dealerArray[i].style.left = ((-40 * Math.cos(theta[i])) + 50) + 'px';
				betsArray[i].style.left = -(145 * Math.cos(theta[i])) + 'px';
			} else if ( i>=5) {
				circleArray[i].style.left = (Math.round(rx * Math.cos(theta[i])) - 50) + 'px';
				dealerArray[i].style.left = ((-40 * Math.cos(theta[i])) + 50) + 'px';
				betsArray[i].style.left = -(145 * Math.cos(theta[i])) + 'px';
			}
			 else {
				circleArray[i].style.left = (Math.round(rx * Math.cos(theta[i]))) + 'px';
			}

			if(i == 3 || i == 7) {
				dealerArray[i].style.top = '-28px';
				betsArray[i].style.top = '0px';

			}
			
		}
	};

	$(document).ready(function() {
		$(window).on('resize', function() {
			setupCircle(10, ($("#table").width() / 2), ($("#table").height() / 2) + 20);
		});
	});
}]);