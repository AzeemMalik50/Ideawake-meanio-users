'use strict';

angular.module('mean.users').factory('MeanUser', [ '$rootScope', '$http', '$location', '$stateParams',
  '$cookies', '$q', '$timeout', '$meanConfig', 'Global',
  function($rootScope, $http, $location, $stateParams, $cookies, $q, $timeout, $meanConfig, Global) {

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
      $http.get('/api/users/me').success(function(response) {
        if(!response && $cookies.get('token') && $cookies.get('redirect')) {
          self.onIdentity.bind(self)({
            token: $cookies.get('token'),
            redirect: $cookies.get('redirect').replace(/^"|"$/g, '')
          });
          $cookies.remove('token');
          $cookies.remove('redirect');
        } else {
          self.onIdentity.bind(self)(response);
        }
      });
    }

    MeanUserKlass.prototype.onIdentity = function(response) {
      if (!response) return;

      var encodedUser, user, destination;

      if (angular.isDefined(response.token)) {
        localStorage.setItem('JWT', response.token);
        encodedUser = decodeURI(b64_to_utf8(response.token.split('.')[1]));
        user = JSON.parse(encodedUser);
      }

      destination = angular.isDefined(response.redirect) ? response.redirect : destination;

      //console.log("DESTINATiON IS: " + destination);

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
      $http.get('/api/circles/mine').success(function(acl) {
        self.acl = acl;

         if(typeof($cookies.get('redirect')) !== 'undefined' && ($cookies.get('redirect') !== 'undefined')) {

          var redirect = $cookies.get('redirect');

          $cookies.remove('redirect');
          $location.path(redirect);

        } else if (destination) {
          $location.path(destination);
        }

        $rootScope.$emit('loggedin', userObj);
        Global.authenticate(userObj);

      });
    };

    MeanUserKlass.prototype.onIdFail = function (response) {
      // console.log(response);
      $location.path(response.redirect);
      this.loginError = 'Authentication failed.';
      this.registerError = response;
      this.validationError = response.msg;
      if(Object.prototype.toString.call( response ) === '[object Array]') {
        this.resetpassworderror = response[0].msg;
        $rootScope.$emit('resetpasswordfailed');
      }
      $rootScope.$emit('loginfailed');
      $rootScope.$emit('registerfailed');
    };

    var MeanUser = new MeanUserKlass();

    // MeanUserKlass.prototype.login = function (user) {
    //   // this is an ugly hack due to mean-admin needs
    //   var destination = $location.path().indexOf('/login') === -1 ? $location.absUrl() : false;
    //   $http.post('/api/login', {
    //       email: user.email,
    //       password: user.password,
    //       redirect: destination
    //     })
    //     .success(this.onIdentity.bind(this))
    //     .error(this.onIdFail.bind(this));
    // };


    MeanUserKlass.prototype.login = function (user) {

      var destination = (user.redirect && user.redirect !== '/auth/login') ? user.redirect : false;

      $http.post('/api/login', {
          email: user.email,
          password: user.password,
          redirect: destination
        })
        .success(this.onIdentity.bind(this))
        .error(this.onIdFail.bind(this));
    };

    MeanUserKlass.prototype.register = function(user) {
      $http.post('/api/register', {
        email: user.email,
        password: user.password,
        confirmPassword: user.confirmPassword,
        username: user.username,
        name: user.name,
        roles: user.roles
      })
        .success(this.onIdentity.bind(this))
        .error(this.onIdFail.bind(this));
    };

    MeanUserKlass.prototype.resetpassword = function(user) {
        $http.post('/api/reset/' + $stateParams.tokenId, {
          password: user.password,
          confirmPassword: user.confirmPassword
        })
          .success(function(response) {
            // this.onIdentity.bind(this);
            $location.url($meanConfig.loginPage)
          })
          .error(this.onIdFail.bind(this));
      };

    MeanUserKlass.prototype.forgotpassword = function(user) {
        $http.post('/api/forgot-password', {
          text: user.email
        })
          .success(function(response) {
            $rootScope.$emit('forgotmailsent', response);
          })
          .error(this.onIdFail.bind(this));
      };

    MeanUserKlass.prototype.logout = function(){
      this.user = {};
      this.loggedin = false;
      this.isAdmin = false;

      $http.get('/api/logout').success(function(data) {
        localStorage.removeItem('JWT');
        $rootScope.$emit('logout');
        Global.authenticate();
      });
    };

    MeanUserKlass.prototype.checkLoggedin = function() {
     var deferred = $q.defer();

      // console.log("checkLoggedin");

      // Make an AJAX call to check if the user is logged in
      $http.get('/api/loggedin').success(function(user) {
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
      $http.get('/api/loggedin').success(function(user) {
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

      //console.log("checkAdmin");
      // Make an AJAX call to check if the user is logged in
      $http.get('/api/loggedin').success(function(user) {
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
