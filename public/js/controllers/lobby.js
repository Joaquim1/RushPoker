app.controller('LobbyController', ['$scope', '$rootScope', '$http', '$location', function( $scope, $rootScope, $http, $location ) {
	$scope.lobbyTables = [];
	$scope.selectedTable = -1;
	$scope.buyInSelection = 0;
	$scope.editTableId = -1;
	$scope.editTableData = null;
	$scope.editTableModalVisible = false;

	$http({
		url: '/lobby-data',
		method: 'GET'
	}).success(function ( data, status, headers, config ) {
		for( tableId in data ) {
			$scope.lobbyTables[tableId] = data[tableId];
		}
	});

	$scope.showJoinTableModal = function( tableId ) {
		$scope.joinTableModalVisible = true;
		$scope.selectedTable = tableId;
		$scope.waitForBigBlind = true;
		var curTable = $scope.lobbyTables[tableId];

		if($rootScope.totalChips > curTable.maxBuyIn) {
			$scope.buyInAmount = parseInt(curTable.maxBuyIn);
		}  else if($rootScope.totalChips < curTable.minBuyIn) {
			$scope.buyInError = 'You do not have enough chips to play on this table';
		} else {
			$scope.buyInAmount = parseInt($rootScope.totalChips);
		}
	}

	$scope.sitInTable = function () {
		var curTable = $scope.lobbyTables[$scope.selectedTable];
		var buyInAmount;

		// Determine which value to use from lobby modal
		switch($scope.buyInSelection)
		{
			case 1: buyInAmount = curTable.maxBuyIn; break;
			case 2: buyInAmount = curTable.minBuyIn; break;
			case 3: buyInAmount = parseInt($scope.buyInAmount); break;
			default: buyInAmount = 0; break;
		}

		// Making sure buy in is valid
		if($scope.buyInSelection !== 0 && buyInAmount >= curTable.minBuyIn && buyInAmount <= curTable.maxBuyIn && $rootScope.totalChips >= buyInAmount)
		{
			// Success, bring to table
			$rootScope.buyInAmount = buyInAmount;
			$rootScope.waitForBigBlind = $scope.waitForBigBlind;
			socket.emit('enterTable', curTable.id, function( response ) {
				if(response.success === true) {
					$rootScope.mySeat = response.seat;
					$rootScope.seatsCount = response.seatsCount;
					$location.url('/table-10/' + curTable.id)
					$scope.$apply();
				} else {
					$scope.buyInError = 'Sorry, that table is currently full';
				}
			});
		} else if ($scope.buyInSelection === 0) {
			$scope.buyInError = 'Please select a buy in amount';
		}else {
			if(buyInAmount > $rootScope.totalChips) {
				$scope.buyInError = 'You do not have that many chips';
			} else if(buyInAmount > curTable.maxBuyIn) {
				$scope.buyInError = 'Maximum buy in: ' + curTable.maxBuyIn;
			}  else if(buyInAmount < curTable.minBuyIn) {
				$scope.buyInError = 'Minimum buy in: ' + curTable.minBuyIn;
			} else {
				$scope.buyInError = 'Please enter a valid buy in';
			}
		}
	}
	
	$scope.selectBuyIn = function( selection ) {
		$scope.buyInSelection = selection;
	}

	$scope.closeJoinTableModal = function() {
		$scope.joinTableModalVisible = false;
		$scope.selectedTable = -1;
		$scope.buyInError = '';
		$scope.buyInSelection = 0;
	}

	$scope.deleteTable = function( id ) {
		socket.emit('deleteTable', id);
	}

	$scope.editTableModal = function( id ) {
		$scope.editTableId = id;
		socket.emit('allTableData', id, function( publicData, timeBank, raiseBlinds, rakeInfo ) {
			if(publicData) {
				$scope.editTableData = publicData;
				$scope.editTableData.timeBank = timeBank;
				$scope.editTableData.raiseBlinds = raiseBlinds;
				$scope.editTableData.rakeInfo = rakeInfo;

				$scope.editTableModalVisible = true;
				$scope.$digest();
			} 
			tables[tableId].public, tables[tableId].timeBank, tables[tableId].raiseBlinds
		});
	}

	$scope.updateTable = function() {
		var updateData = {
			'name': document.getElementById('editTableName').value,
			'description': document.getElementById('editTableDescription').value,
			'sb': document.getElementById('editTableSB').value,
			'bb': document.getElementById('editTableBB').value,
			'minplayers': document.getElementById('editTableMinPlayers').value,
			'maxplayers': document.getElementById('editTableMaxPlayers').value,
			'minbuyin': document.getElementById('editTableMinBuyIn').value,
			'maxbuyin': document.getElementById('editTableMaxBuyIn').value,
			'timebank': document.getElementById('editTableTimeBank').value,
			'raiseblinds': document.getElementById('editTableRaiseBlinds').value,
			'rakeminprefloppot': document.getElementById('editTableRakeMinPreflopPot').value,
			'rakeprefloppot': document.getElementById('editTableRakePreflopPot').value,
			'rakepostfloppercent': document.getElementById('editTableRakePostflopPercent').value,
			'rakepostflopmax': document.getElementById('editTableRakePostflopMax').value
		};

		socket.emit('updateTable', $scope.editTableId, updateData);
		$scope.editTableModalVisible = false;
		$scope.$digest();
	}

	$scope.closeEditTable = function() {
		$scope.editTableModalVisible = false;
		$scope.$digest();
	}

	socket.on('lobby-data', function( data ) {
		$scope.lobbyTables = data;
		$scope.$digest();
	});

	/*
	$scope.register = function() {
		// If there is some trimmed value for a new screen name
		if( $scope.newScreenName ) {
			socket.emit( 'register', $scope.newScreenName, function( response ){
				if( response.success ){
					$rootScope.screenName = response.screenName;
					$rootScope.totalChips = response.totalChips;
					$scope.registerError = '';
					$rootScope.$digest();
				}
				else if( response.message ) {
					$scope.registerError = response.message;
				}
				$scope.$digest();
			});
		}
	}*/
}]);