/**
 * The seat directive. It requires two attributes.
 * seatIndex: The index of the player in the "seats" array
 * cellNumber: The number of the cell in the grid (used for styles)
 */
app.directive( 'seat', [function() {
	return {
		restrict: 'E',
		templateUrl: '/partials/seat.html',
		replace: true,
		scope: {
			player: '=',
			mySeat: '=',
			myCards: '=',
			activeSeat: '=',
			selectedSeat: '=',
			sittingOnTable: '=',
			dealerSeat: '=',
			seatsCount: '=',
			notifications: '=',
			actionState: '=',
			turnTimer: '=',
			activeTimer: '=',
			seatIndex: '=',
			showBuyInModal: '&'
		},
		link: function(scope, element, attributes) {

			scope.getCardClass = function( seat, card ) {
				if( scope.mySeat === seat ) {
					return scope.myCards[card];
				}
				else if ( typeof scope.player !== 'undefined' && scope.player && scope.player.cards && scope.player.cards[card] ) {
					return 'card-face-' + scope.player.cards[card];
				}
				else {
					return 'card-back';
				}
			}

			scope.getCardDescription = function( seat, card ) {
				if( scope.mySeat === seat ) {
					return (scope.myCards[card] || '').toUpperCase().replace('CARD-FACE-', '').replace('T', '10').replace('C', ' of clubs').replace('H', ' of hearts').replace('S', ' of spades').replace('D', ' of diamonds').replace('A', 'ace').replace('Q', 'queen').replace('J', 'jack');

				}
				else if ( typeof scope.player !== 'undefined' && scope.player && scope.player.cards && scope.player.cards[card] ) {
					return (scope.player.cards[card] || '').toUpperCase().replace('CARD-', '').replace('T', '10').replace('C', '♣').replace('H', '♥').replace('S', '♠').replace('D', '♦');
				}
				else {
					return '';
				}
			}

			scope.seatOccupied = function( seat ) {
				return !scope.sittingOnTable || ( typeof scope.player !== 'undefined' && scope.player && scope.player.name );
			}

			scope.showMyCards = function() {
				if( scope.mySeat === player.seat ) {
					$("#player-cards-" + scope.mySeat + " .card-container").flip(true);
				}
			}

			scope.showPlayer = function() {
				return parseInt(scope.seatIndex) < parseInt(scope.seatsCount);
			}

			$(".player-cards .card-container").flip({trigger: 'manual'});
		}
	};
}]);