'use strict';

var config = require('meanio').getConfig();
var jwt = require('jsonwebtoken'); //https://npmjs.org/package/node-jsonwebtoken
const MWs = require('../../authorization');

const authTokenMW = MWs.generateAuthToken;

var hasAuthorization = function (req, res, next) {
  if (!req.user.isAdmin || req.user._id.equals(req.user._id)) {
    return res.status(401).send('User is not authorized');
  }
  next();
};

module.exports = function (MeanUser, app, circles, database, passport) {

  // User routes use users controller
  var users = require('../controllers/users')(MeanUser);

  app.use(users.loadUser);

  var loginPage = config.public.loginPage;

  app.route('/api/logout')
    .get(users.signout);
  app.route('/api/users/me')
    .get(users.me)
    .put(hasAuthorization, users.update);

  // Setting up the userId param
  app.param('userId', users.user);

  app.route('/api/users')
    .get(users.search);

  // AngularJS route to check for authentication
  app.route('/api/loggedin').get(users.loggedin);

  // ========== SAML Endpoints =============

  app.route('/api/saml/login')
  .get(passport.authenticate('saml', {
    failureRedirect: '/', failureFlash: true
  }));

  app.route('/api/adfs/postResponse').post(
    passport.authenticate('saml', { failureRedirect: '/', failureFlash: true }),
    MWs.SAMLAuthorization,
    authTokenMW(MeanUser),
    function (req, res) {
      res.redirect(`/saml/auth?t=${req.token}`);
    }
  );

  // =======================================


  app.route('/api/verifyToken').get(
    (req, res) => {
      if (req.user) {
        res.json({
          user: req.user,
          redirect: req.query.redirect
        });
      } else {
        res.status(401).end();
      }
    }
  )


  if (config.strategies.local.enabled) {
    // Setting up the users api
    app.route('/api/register')
      .post(users.create);

    app.route('/api/forgot-password')
      .post(users.forgotpassword);

    app.route('/api/reset/:token')
      .get(users.checkResetToken)
      .post(users.resetpassword);

    // Setting the local strategy route
    app.route('/api/login')
      .post(
        passport.authenticate('local', {
          failureFlash: false
        }),
        authTokenMW(MeanUser),
        function (req, res) {
          res.json({
            token: req.token,
            user: req.user,
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
        scope: ['users:read'],
        failureRedirect: loginPage,
      }), users.signin);

    app.route('/api/auth/slack/callback')
      .get(passport.authenticate('slack', {
        failureRedirect: loginPage,
      }), users.authCallback);
  }
};
