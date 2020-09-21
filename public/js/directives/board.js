/**
 * The board directive. It requires one attribute
 * cards: The array of common cards
 */
app.directive( 'board', [function() {
	return {
		restrict: 'E',
		templateUrl: '/partials/board.html',
		replace: true,
		scope: {
			cards: '=',
		},
		link: function( $scope, element, attrs ) {
			for( var i = 0; i < 5; i++ ) {
				$("#card-" + i).flip({trigger: 'manual'});
			}
		}
	};
}]);
