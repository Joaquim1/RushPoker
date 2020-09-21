var socket = io.connect({path: '/socket.io'});

var app = angular.module( 'app', ['ngRoute'] ).config( function( $routeProvider, $locationProvider ) {
	$routeProvider.when('/table-10/:tableId', {
		templateUrl: '/partials/table-10-handed.html',
		controller: 'TableController', 
	});

	$routeProvider.when('/table-6/:tableId', {
		templateUrl: '/partials/table-6-handed.html',
		controller: 'TableController', 
	});

	$routeProvider.when('/table-2/:tableId', {
		templateUrl: '/partials/table-2-handed.html',
		controller: 'TableController', 
	});

	$routeProvider.when('/', {
		templateUrl: '/partials/lobby.html',
		controller: 'LobbyController', 
	});

	$routeProvider.otherwise( { redirectTo: '/' } );

	$locationProvider.html5Mode(true).hashPrefix('!');
});

app.filter('card', function() {
 return function(data) {
  return (data || '').toUpperCase().replace('CARD-FACE-', '').replace('T', '10').replace('C', ' of clubs').replace('H', ' of hearts').replace('S', ' of spades').replace('D', ' of diamonds').replace('A', 'ace').replace('Q', 'queen').replace('J', 'jack');
 }
});

app.run( function( $rootScope ) {
	socket.emit('init', function( res ) {
		$rootScope.screenName = res.screenName;
		$rootScope.totalChips = res.totalChips;
		$rootScope.isAdmin = res.isAdmin;
		$rootScope.sittingOnTable = '';
		$rootScope.$digest();
	});
});