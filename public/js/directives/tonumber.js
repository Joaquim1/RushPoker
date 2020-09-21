app.directive('toNumber', function () {
    return {
        require: 'ngModel',
        link: function (scope, elem, attrs, ctrl) {
            ctrl.$parsers.push(function (value) {
                return (parseFloat(parseFloat(value).toFixed(2)) || '');
            });
        }
    }
});