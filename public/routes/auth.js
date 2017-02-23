'use strict';

//Setting up route
angular.module('mean.users').config(['$httpProvider', 'jwtInterceptorProvider',
  function($httpProvider, jwtInterceptorProvider) {    

  	function localStorageTest() {
	    var test = 'test';
	    try {
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
	    } catch(e) {
        return false;
	    }
		}

    jwtInterceptorProvider.tokenGetter = function() {
      if (localStorageTest()) {
      	return localStorage.getItem('JWT');
      } else { return '' }
    };

    $httpProvider.interceptors.push('jwtInterceptor');
  }
]);
