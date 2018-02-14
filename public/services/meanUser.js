'use strict';

angular.module('mean.users').factory('MeanUser', [ '$rootScope', '$http', '$location', '$stateParams',
  '$cookies', '$q', '$timeout', '$meanConfig', 'Global', 'localization',
  function($rootScope, $http, $location, $stateParams, $cookies, $q, $timeout, $meanConfig, Global, localization) {

    var self;

    function escape(html) {
      return String(html)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function b64_to_utf8( str ) {
      return decodeURIComponent(escape(window.atob( str )));
    }

    /*function url_base64_decode(str) {
      var output = str.replace('-', '+').replace('_', '/');
      switch (output.length % 4) {
      case 0:
      break;
      case 2:
      output += '==';
      break;
      case 3:
      output += '=';
      break;
      default:
      throw 'Illegal base64url string!';
      }
      return window.atob(output); //polifyll https://github.com/davidchambers/Base64.js
    }*/

    function MeanUserKlass(){
      this.name = 'users';
      this.user = {};
      this.acl = {};
      this.registerForm = false;
      this.loggedin = false;
      this.isAdmin = false;
      this.loginError = 0;
      this.usernameError = null;
      this.registerError = null;
      this.resetpassworderror = null;
      this.validationError = null;
      self = this;
      $http.get('/api/users/me').then(function(response) {
        if(!response.data && $cookies.get('token') && $cookies.get('redirect')) {
          self.onIdentity.bind(self)({
            token: $cookies.get('token'),
            redirect: $cookies.get('redirect').replace(/^"|"$/g, '')
          });
          $cookies.remove('token');
          $cookies.remove('redirect');
        } else {
          self.onIdentity.bind(self)(response.data);
        }
      });
    }

    MeanUserKlass.prototype.onIdentity = function(response) {
      if (!response) return;

      // Workaround for Angular 1.6.x
      if (response.data)
        response = response.data;
        response.token = response.token ?  response.token: localStorage.getItem('JWT')
      var encodedUser, user, destination;

      if (angular.isDefined(response.token)) {
        localStorage.setItem('JWT', response.token);
        encodedUser = decodeURI(b64_to_utf8(response.token.split('.')[1]));
        user = JSON.parse(encodedUser);
        localization.changeLanguage(user.userProfile.defaultLanguage);
      }

      destination = angular.isDefined(response.redirect) ? response.redirect : destination;

      this.user = user || response;
      this.loggedin = true;
      this.loginError = 0;
      this.registerError = 0;

      if(this.user.roles) {
        this.isAdmin = this.user.roles.indexOf('admin') > -1;
      } else {
        this.isAdmin = false;
      }

      var userObj = this.user;
      var self = this;
      // Add circles info to user
      $http.get('/api/circles/mine').then(function(response) {
        self.acl = response.data;
        
        $rootScope.loading = false;   
        $rootScope.$emit('loggedin', userObj);
        
        Global.authenticate(userObj);
        if(typeof($cookies.get('redirect')) !== 'undefined' && ($cookies.get('redirect') !== 'undefined')) {
          var redirect = $cookies.get('redirect');
          $cookies.remove('redirect');
          $location.url(redirect);
        } else if (destination) {
          $location.url(destination);
        }
      });
    };

    MeanUserKlass.prototype.onIdFail = function (response) {

      // Workaround for Angular 1.6.x
      if (response.data)
        response = response.data;

      $location.path(response.redirect);
      this.loginError = 'Email or password incorrect, please try again.';
      this.registerError = response;
      this.validationError = response.msg;
      if(Object.prototype.toString.call( response ) === '[object Array]') {
        this.resetpassworderror = response[0].msg;
        $rootScope.$emit('resetpasswordfailed');
      }
      $rootScope.$emit('loginfailed');
      $rootScope.$emit('registerfailed');
    };

    // adfs error handling
    MeanUserKlass.prototype.onAdfsTokenFail = function (response) {

      if (response.data)
        response = response.data;

        $rootScope.$emit('adfsTokenFailed');
    };

    var MeanUser = new MeanUserKlass();

    MeanUserKlass.prototype.login = function (user) {
      var destination = (user.redirect && user.redirect !== '/auth/login') ? user.redirect : false;

      $http.post('/api/login', {
          email: user.email,
          password: user.password,
          redirect: destination
        })
        .then(this.onIdentity.bind(this))
        .catch(this.onIdFail.bind(this));
    };
    // login with saml 
    MeanUserKlass.prototype.loginSaml = function (token) {
      $http.get('/api/verifyToken', {
          token: token,
        })
        .then(this.onIdentity.bind(this))
        .catch(this.onAdfsTokenFail.bind(this));
    };

    MeanUserKlass.prototype.register = function(user) {
      $http.post('/api/register', {
        email: user.email,
        password: user.password,
        confirmPassword: user.confirmPassword,
        username: user.username,
        name: user.name,
        inviteId: (user.inviteId) ? user.inviteId : null,
        roles: user.roles
      })
        .then(this.onIdentity.bind(this))
        .catch(this.onIdFail.bind(this));
    };

    MeanUserKlass.prototype.resetpassword = function(user) {
        $http.post('/api/reset/' + $stateParams.tokenId, {
          password: user.password,
          confirmPassword: user.confirmPassword
        })
        .then(this.onIdentity.bind(this))
        .catch(this.onIdFail.bind(this));

      };
      
    MeanUserKlass.prototype.checkPasswordToken = function(user) {
      $http.get('/api/reset/' + $stateParams.tokenId)
      .then(function(response) {
        if(response.status == 400) {
          $rootScope.$emit('resetpassworderror', response.data.msg);
        }
      }, function(error) {
        if(error.data && error.data.msg) {
          $rootScope.$emit('resetpassworderror', error.data.msg);
        }
      });
    };

    MeanUserKlass.prototype.forgotpassword = function(user) {
        $http.post('/api/forgot-password', {
          text: user.email
        })
          .then(function(response) {
            $rootScope.$emit('forgotmailsent', response.data);
          })
          .catch(this.onIdFail.bind(this));
      };

    MeanUserKlass.prototype.logout = function(){
      this.user = {};
      this.loggedin = false;
      this.isAdmin = false;

      $http.get('/api/logout').then(function(response) {
        localStorage.removeItem('JWT');
        $rootScope.$emit('logout');
        Global.authenticate();
        localization.changeLanguage();
      });
    };

    MeanUserKlass.prototype.checkLoggedin = function() {
     var deferred = $q.defer();

      // console.log("checkLoggedin");

      // Make an AJAX call to check if the user is logged in
      $http.get('/api/loggedin').then(function(response) {
        var user = response.data;
        // Authenticated
        if (user !== '0') {
          $timeout(deferred.resolve);
        // Not Authenticated
        } else {
          // console.log("No User");
          $cookies.put('redirect', $location.path());
          // console.log("Cookies", $cookies.getAll());
          $timeout(deferred.reject);
          $location.url($meanConfig.loginPage);
        }
      });

      return deferred.promise;
    };

    MeanUserKlass.prototype.checkLoggedOut = function() {
       // Check if the user is not connected
      // Initialize a new promise
      var deferred = $q.defer();

      // Make an AJAX call to check if the user is logged in
      $http.get('/api/loggedin').then(function(response) {
        var user = response.data;
        // Authenticated
        if (user !== '0') {
          $timeout(deferred.reject);
          $location.url('/');
        }
        // Not Authenticated
        else $timeout(deferred.resolve);
      });

      return deferred.promise;
    };

    MeanUserKlass.prototype.checkAdmin = function() {
     var deferred = $q.defer();

      // Make an AJAX call to check if the user is logged in
      $http.get('/api/loggedin').then(function(response) {
        var user = response.data;
        // Authenticated
        if (user !== '0' && user.roles.indexOf('admin') !== -1) $timeout(deferred.resolve);

        // Not Authenticated or not Admin
        else {
          $timeout(deferred.reject);
          $location.url('/');
        }
      });

      return deferred.promise;
    };
    MeanUserKlass.prototype.search = function(params){
      var deferred = $q.defer();
      $http.get('/api/users', {params:params}).then(function(result) {
        console.log('searched user result', result);
        deferred.resolve(result.data);

      }, function(error) {
        console.log('searched user error', error);
        deferred.reject(error);
      });
      return deferred.promise;
    };
    return MeanUser;
  }
]);
