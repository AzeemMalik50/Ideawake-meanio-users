'use strict';

angular.module('mean.users')
  .controller('AuthCtrl', ['$scope', '$rootScope', '$http', '$state', 'Global',
    function ($scope, $rootScope, $http, $state, Global) {
      // This object will contain list of available social buttons to authorize
      $scope.socialButtonsCounter = 0;
      $scope.global = Global;
      $scope.$state = $state;

      $http.get('/api/get-config')
        .then(function (response) {
          var config = response.data;
          if (config.hasOwnProperty('local')) delete config.local; // Only non-local passport strategies
          $scope.socialButtons = config;
          $scope.socialButtonsCounter = Object.keys(config).length;
        });
    }
  ])

  .controller('LoginCtrl', ['$rootScope', 'MeanUser', '$location', '$http',
    function ($rootScope, MeanUser, $location, $http) {

      var vm = this;
      vm.user = {};
      var query = $location.search();

      vm.input = {
        type: 'password',
        placeholder: 'Password',
        confirmPlaceholder: 'Repeat Password',
        iconClass: '',
        tooltipText: 'Show password'
      };

      vm.togglePasswordVisible = function () {
        vm.input.type = vm.input.type === 'text' ? 'password' : 'text';
        vm.input.placeholder = vm.input.placeholder === 'Password' ? 'Visible Password' : 'Password';
        vm.input.iconClass = vm.input.iconClass === 'icon_hide_password' ? '' : 'icon_hide_password';
        vm.input.tooltipText = vm.input.tooltipText === 'Show password' ? 'Hide password' : 'Show password';
      };

      $rootScope.$on('loginfailed', function () {
        vm.loginError = MeanUser.loginError;
      });

      // Register the login() function
      vm.login = function () {

        if (query.redirect) {
          this.user.redirect = query.redirect;
        } else {
          this.user.redirect = false;
        }

        MeanUser.login(this.user);

      };
    }
  ])
  .controller('RegisterCtrl', ['$rootScope', 'MeanUser',
    function ($rootScope, MeanUser) {
      var vm = this;

      vm.user = {};

      vm.registerForm = MeanUser.registerForm = true;

      vm.input = {
        type: 'password',
        placeholder: 'Password',
        placeholderConfirmPass: 'Repeat Password',
        iconClassConfirmPass: '',
        tooltipText: 'Show password',
        tooltipTextConfirmPass: 'Show password'
      };

      vm.togglePasswordVisible = function () {
        vm.input.type = vm.input.type === 'text' ? 'password' : 'text';
        vm.input.placeholder = vm.input.placeholder === 'Password' ? 'Visible Password' : 'Password';
        vm.input.iconClass = vm.input.iconClass === 'icon_hide_password' ? '' : 'icon_hide_password';
        vm.input.tooltipText = vm.input.tooltipText === 'Show password' ? 'Hide password' : 'Show password';
      };
      vm.togglePasswordConfirmVisible = function () {
        vm.input.type = vm.input.type === 'text' ? 'password' : 'text';
        vm.input.placeholderConfirmPass = vm.input.placeholderConfirmPass === 'Repeat Password' ? 'Visible Password' : 'Repeat Password';
        vm.input.iconClassConfirmPass = vm.input.iconClassConfirmPass === 'icon_hide_password' ? '' : 'icon_hide_password';
        vm.input.tooltipTextConfirmPass = vm.input.tooltipTextConfirmPass === 'Show password' ? 'Hide password' : 'Show password';
      };

      // Register the register() function
      vm.register = function () {
        MeanUser.register(this.user);
      };

      $rootScope.$on('registerfailed', function () {
        vm.registerError = MeanUser.registerError;
      });
    }
  ])
  .controller('ForgotPasswordCtrl', ['MeanUser', '$rootScope',
    function (MeanUser, $rootScope) {
      var vm = this;
      vm.user = {};
      vm.registerForm = MeanUser.registerForm = false;
      vm.forgotpassword = function () {
        MeanUser.forgotpassword(this.user);
      };
      $rootScope.$on('forgotmailsent', function (event, args) {
        vm.response = args;
        $location.url('/');
      });
    }
  ])
  .controller('ResetPasswordCtrl', ['MeanUser', '$rootScope', '$sce',
    function (MeanUser, $rootScope, $sce) {
      var vm = this;
      vm.user = {};
      vm.registerForm = MeanUser.registerForm = false;
      vm.resetpassworderror = false;
      console.log('MeanUser.checkPasswordToken()')
      MeanUser.checkPasswordToken();

      vm.resetpassword = function () {
        MeanUser.resetpassword(this.user);
      };
      $rootScope.$on('resetpassworderror', function () {
        vm.resetpassworderror = $sce.trustAsHtml('This link has expired. Please go to the <a href="/forgotpassword">reset password</a> page and enter your email to get a new link');
      });
    }
  ])
  .controller('SamlAuth', ['MeanUser', '$rootScope', '$sce', '$location',
    function (MeanUser, $rootScope, $sce, $location) {
      var vm = this;
      vm.user = {};
      vm.message = 'Verifying Your request please wait...';
      vm.params = $location.search();
      $rootScope.loading = true;

      $rootScope.$on('adfsTokenFailed', function () {
        localStorage.removeItem('JWT');
        vm.erroprMessage = $sce.trustAsHtml('This link is not valid. Please go to the <a href="/">home</a> page.');
        $rootScope.loading = false;
      });
      /* service to verify saml token */
      if (vm.params.n) {
        // check that if user has got any parameter named n then it mean it is a new user
        // and need to complete profile
        localStorage.setItem('JWT', vm.params.t);
        $cookies.put('redirect', "/complete-profile");
        MeanUser.loginSaml(vm.token);
      } else if (vm.params.t) {
        localStorage.setItem('JWT', vm.params.t);
        MeanUser.loginSaml(vm.token);
        $location.url('/');
      } else {
        $rootScope.$emit('adfsTokenFailed');
      }
    }
  ]);
