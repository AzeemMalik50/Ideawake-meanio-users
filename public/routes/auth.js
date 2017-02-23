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

    jwtInterceptorProvider.tokenGetter = ['$cookies', '$location', function($cookies, $location) {
      if (localStorageTest()) {
      	return localStorage.getItem('JWT');
      } else {
        $cookies.put('nolocalstorage', 'true');
        $location.url('/unsupported-browser');
      	// return $cookies.get('id_token');
      }
    }];

    $httpProvider.interceptors.push('jwtInterceptor');
  }
]);
