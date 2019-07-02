'use strict';

//Setting up route
angular.module('mean.users').config(['$httpProvider', 'jwtInterceptorProvider',
  function ($httpProvider, jwtInterceptorProvider) {

    function localStorageTest() {
      var test = 'test';
      try {
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
      } catch (e) {
        return false;
      }
    }

    function clearTokensAndRedirectToLogin($location) {
      localStorage.removeItem('JWT');
      localStorage.removeItem('rft');
      $location.url('/auth/login');
    }

    jwtInterceptorProvider.tokenGetter = ['$cookies', '$location', '$window', '$http', 'jwtHelper', function ($cookies, $location, $window, $http, jwtHelper) {
      if (localStorageTest()) {
        var lcJwt = localStorage.getItem('JWT');
        var rft = localStorage.getItem('rft');
        var user;

        const queryParams = $location.search();
        if (queryParams.email === 'true' && queryParams.inviteId) {
          $window.location.href = `auth/invite/accept/${queryParams.inviteId}`;
        }  

        const loggedOutUrls = ['/', '/signup', '/auth/login', '/forgotpassword', '/privacy', '/tos', '/contact', '/saml/auth'];
        if (!lcJwt && !_.includes(loggedOutUrls, $location.$$path) && !$location.$$path.includes('/reset') && !$location.$$path.includes('/invite/accept')) {
          clearTokensAndRedirectToLogin($location);
          return;
        }

        try {
          user = lcJwt ? jwtHelper.decodeToken(lcJwt) : null;
        } catch (err) {
          console.log('bad token, logging user out', lcJwt, rft);
          console.error(err);
          clearTokensAndRedirectToLogin($location);
          return;
        }
        // The following if condistion is used to check if user has old token
        // with full userProfile object. The new token contains userProfile a id(string)
        if (
          user
          && typeof user.userProfile !== 'string'
          && user.userProfile !== null
        ) {
          clearTokensAndRedirectToLogin($location);
          return;
        } else if (lcJwt && rft && jwtHelper.isTokenExpired(lcJwt)) {
          return $http({
            url: '/api/refreshtoken',
            skipAuthorization: true,
            method: 'POST',
            data: { refreshToken: rft, id: user._id }
          })
          .then(function(response) {
              if(response && response.data) {
                localStorage.setItem('JWT', response.data.token);
                return response.data.token;
              }
            })
            .catch(function(err) {
              console.log(err);
              clearTokensAndRedirectToLogin($location);
              return;
            });

        } else {
          return lcJwt;
        }
      } else {
        $cookies.put('nolocalstorage', 'true');
        $location.url('/unsupported-browser');
        // return $cookies.get('id_token');
      }
    }];

    $httpProvider.interceptors.push('jwtInterceptor');
  }
]);
