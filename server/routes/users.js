'use strict';

var config = require('meanio').getConfig();
const MWs = require('../../authorization');

const authTokenMW = MWs.generateAuthToken;

var hasAuthorization = function (req, res, next) {
  if (!req.user.isAdmin || req.user._id.equals(req.user._id)) {
    return res.status(403).send('User is not authorized');
  }
  next();
};

module.exports = function (MeanUser, app, circles, database, passport) {

  // User routes use users controller
  var users = require('../controllers/users')(MeanUser);

  app.use(users.loadUser);

  var loginPage = config.public.loginPage;

  // refresh token
  app.route('/api/refreshtoken')
  .post(MWs.validateRefreshToken,
  authTokenMW(MeanUser),
  function (req, res) {
    res.json({
      token: req.token
    });
  });

  app.route('/api/logout')
  // deleting refresh token
    .get(users.signout);
  app.route('/api/users/me')
    .get(users.me)
    .put(hasAuthorization, users.update);

  // Setting up the userId param
  app.param('userId', users.user);

  // app.route('/api/users')
  //   .get(users.search);

  // AngularJS route to check for authentication
  app.route('/api/loggedin').get(users.loggedin);

  // ========== SAML Endpoints =============

  app.route('/api/saml/login')    
  .get(function(req, res, next) {
    // Using RelayState to keep track of invitationId
    // As per SAML 2.0 specifications
    //3.1.1 Use of RelayState
    //Some bindings define a "RelayState" mechanism for preserving and conveying state information. When
    //such a mechanism is used in conveying a request message as the initial step of a SAML protocol, it
    ///places requirements on the selection and use of the binding subsequently used to convey the response.
    //Namely, if a SAML request message is accompanied by RelayState data, then the SAML responder
    //MUST return its SAML protocol response using a binding that also supports a RelayState mechanism, and
    //it MUST place the exact RelayState data it received with the request into the corresponding RelayState
    //parameter in the response.

    // passport-saml does not support dynamic RelayState
    // but passport.js does and populates RelayState using following code 
    // var RelayState = req.query && req.query.RelayState || req.body && req.body.RelayState;
    // if (RelayState) {
    //  additionalParams.RelayState = RelayState;
    // }
    // Thus we can use RelayState for sending invitationId to IdentityProvider and get back exact same Id in Post Resposne
    // Reference Link: 
    //https://stackoverflow.com/questions/24601188/how-do-i-redirect-back-to-the-originally-requested-url-after-authentication-with/46555155#46555155
    if (req.query && req.query.inv) {
      req.query.RelayState = JSON.stringify({ invitationId: req.query.inv });      
    }

    passport.authenticate('saml', {
      failureRedirect: '/',
      failureFlash: true,
    })(req, res, next);
  });

  app.route('/api/adfs/postResponse').post(
    passport.authenticate('saml', { failureRedirect: '/', failureFlash: true }),
    MWs.SAMLAuthorization,
    authTokenMW(MeanUser),
    function (req, res) {      
      res.redirect(`/saml/auth?t=${req.token}&n=${!!req.isUserNew}&semail=${req.showSecondaryEmailPage}`);
    }
  );

  // =======================================
  
  // ============ AZURE OAUTH ENDPOINTS ===========

  app.route('/api/oauth/azure')    
  .get(function(req, res, next) {
    // In oauth we can use state param to keey track of invitationId
    const params = {};
    if (req.query && req.query.inv) {
      params.state = JSON.stringify({ invitationId: req.query.inv });
    }
    passport.authenticate('azure-oauth', params)(req, res, next);
  });

  app.route('/api/oauth/azure/callback').get(    
    (req, res, next) => {
      /**
       * This WM checks if there is an error in query params related to User's Consent and App permissions.
       * Because, on Azure level, the user gives consent to required permissions by clicking Accept button
       * But Azure still gives error on the callback. If you reload the and try to login again this time no error
       * is given.
       * Probably in first time, Azure sends back response before updating settings for user consent.
       */
      const { error_description } = req.query;
      if (error_description) {
        const errDescArr = error_description.split(':');
        const errorCode = errDescArr[0];
        switch (errorCode) {
          case 'AADSTS90008': {
            res.redirect('/auth/login');
            break;
          }
          default: {
            next();
          }
        }
      } else {
        next();
      }
    },
    passport.authenticate('azure-oauth'),
    MWs.SAMLAuthorization,
    authTokenMW(MeanUser),
    (req, res) => {
      res.redirect(`/saml/auth?t=${req.token}&n=${!!req.isUserNew}&semail=${req.showSecondaryEmailPage}`);
    }
  );

  // =======================================


  app.route('/api/verifyToken')
  .get(MWs.generateRefreshToken,
    (req, res) => {
      if (req.user) {
        console.log(req.query);
        res.json({
          user: req.user,
          refreshToken : req.refreshToken,
          redirect: req.query.redirect
        });
      } else {
        console.log('token verification failed');
        res.redirect('/auth/login');
        // res.status(401).end();
      }
    }
  )


  if (config.strategies.local.enabled) {
    // Setting up the users api
    app.route('/api/register')
      .post(
        MWs.passwordValidation,
        users.create,
        authTokenMW(MeanUser),
        MWs.generateRefreshToken,
        function (req, res) {
          console.log(req.user, 'req.user');
          res.json({
            token: req.token,
            user: req.user,
            refreshToken : req.refreshToken,
            redirect: req.redirect || config.strategies.landingPage
          });
        }
      );

    app.route('/api/forgot-password')
      .post(users.forgotpassword);

    app.route('/api/reset/:token')
      .get(users.checkResetToken)
      .post(
        users.resetpassword,
        authTokenMW(MeanUser),
        MWs.generateRefreshToken,
        function (req, res) {
          res.json({
            token: req.token,
            user: req.user,
            refreshToken : req.refreshToken,
            redirect: req.redirect || config.strategies.landingPage
          });
        }
      );

    // Setting the local strategy route
    app.route('/api/login')
      .post(
        passport.authenticate('local', {
          failureFlash: false
        }),
        authTokenMW(MeanUser),
        MWs.generateRefreshToken,
        function (req, res) {
          res.json({
            token: req.token,
            user: req.user,
            refreshToken : req.refreshToken,
            redirect: req.redirect || config.strategies.landingPage
          });
        }
      );
  }

  // AngularJS route to get config of social buttons
  app.route('/api/get-config')
    .get(function (req, res) {
      // To avoid displaying unneccesary social logins
      var strategies = config.strategies;
      var configuredApps = {};
      for (var key in strategies) {
        if (strategies.hasOwnProperty(key)) {
          var strategy = strategies[key];
          if (strategy.hasOwnProperty('enabled') && strategy.enabled === true) {
            configuredApps[key] = true;
          }
        }
      }
      res.send(configuredApps);
    });

  if (config.strategies.facebook.enabled) {
    // Setting the facebook oauth routes
    app.route('/api/auth/facebook')
      .get(passport.authenticate('facebook', {
        scope: ['email', 'user_about_me'],
        failureRedirect: loginPage,
      }), users.signin);

    app.route('/api/auth/facebook/callback')
      .get(passport.authenticate('facebook', {
        failureRedirect: loginPage,
      }), users.authCallback);
  }

  if (config.strategies.github.enabled) {
    // Setting the github oauth routes
    app.route('/api/auth/github')
      .get(passport.authenticate('github', {
        failureRedirect: loginPage
      }), users.signin);

    app.route('/api/auth/github/callback')
      .get(passport.authenticate('github', {
        failureRedirect: loginPage
      }), users.authCallback);
  }

  if (config.strategies.twitter.enabled) {
    // Setting the twitter oauth routes
    app.route('/api/auth/twitter')
      .get(passport.authenticate('twitter', {
        failureRedirect: loginPage
      }), users.signin);

    app.route('/api/auth/twitter/callback')
      .get(passport.authenticate('twitter', {
        failureRedirect: loginPage
      }), users.authCallback);
  }

  if (config.strategies.google.enabled) {
    // Setting the google oauth routes
    app.route('/api/auth/google')
      .get(passport.authenticate('google', {
        failureRedirect: loginPage,
        scope: [
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/userinfo.email'
        ]
      }), users.signin);

    app.route('/api/auth/google/callback')
      .get(passport.authenticate('google', {
        failureRedirect: loginPage
      }), users.authCallback);
  }

  if (config.strategies.linkedin.enabled) {
    // Setting the linkedin oauth routes
    app.route('/api/auth/linkedin')
      .get(passport.authenticate('linkedin', {
        failureRedirect: loginPage,
        scope: ['r_emailaddress']
      }), users.signin);

    app.route('/api/auth/linkedin/callback')
      .get(passport.authenticate('linkedin', {
        failureRedirect: loginPage
      }), users.authCallback);
  }


  if (config.strategies.slack.enabled) {
    // Setting the facebook oauth routes
    app.route('/api/auth/slack')
      .get(passport.authenticate('slack', {
        scope: ['users:read', 'identity.basic'],
        failureRedirect: loginPage,
      }), users.signin);

    app.route('/api/auth/slack/callback')
      .get(passport.authenticate('slack', {
        failureRedirect: loginPage,
      }), users.authCallback);
  }

  app.post('/api/users/search', users.search);
  app.post('/api/users/send-welcome-email', users.sendWelcomeEmail);
};
