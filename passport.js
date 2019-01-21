'use strict';

var mongoose = require('mongoose'),
  LocalStrategy = require('passport-local').Strategy,
  TwitterStrategy = require('passport-twitter').Strategy,
  FacebookStrategy = require('passport-facebook').Strategy,
  GitHubStrategy = require('passport-github').Strategy,
  GoogleStrategy = require('passport-google-oauth').OAuth2Strategy,
  LinkedinStrategy = require('passport-linkedin').Strategy,
  SlackStrategy = require('passport-slack').Strategy,
  SamlStrategy = require('passport-saml').Strategy,
  User = mongoose.model('User'),
  config = require('meanio').getConfig();
  // PlatformSetting = mongoose.model('PlatformSetting');

  //platformSettings = require('meanio').getPlatformSettings();

const AzureOAuth2Strategy  = require('passport-azure-oauth2');
const jwt = require('jsonwebtoken');

module.exports = function(passport) {
  // Serialize the user id to push into the session
  passport.serializeUser(function(user, done) {
    done(null, user);
  });

  // Deserialize the user object based on a pre-serialized token
  // which is the user id
  passport.deserializeUser(function(user, done) {
    if(user.id){
      User.findOne({
        _id: id
      }, '-salt -hashed_password', function(err, user) {
        done(err, user);
      });
    }else{
      done(null,user);
    }
  });

  // Use local strategy
  passport.use(new LocalStrategy({
      usernameField: 'email',
      passwordField: 'password'
    },
    function(email, password, done) {
      User.findAndAuthenticate({email}, password)
      .then(user => {
        done(null, user)
      })
      .catch(err => {
        typeof err === 'string' ? done(null, false, {message: err}) : done(err);
      });
    }
  ));

  // Use twitter strategy
  passport.use(new TwitterStrategy({
      consumerKey: config.strategies.twitter.clientID,
      consumerSecret: config.strategies.twitter.clientSecret,
      callbackURL: config.strategies.twitter.callbackURL
    },
    function(token, tokenSecret, profile, done) {
      User.findOne({
        'twitter.id_str': profile.id
      }, function(err, user) {
        if (err) {
          return done(err);
        }
        if (user) {
          return done(err, user);
        }
        user = new User({
          name: profile.displayName,
          username: profile.username,
          provider: 'twitter',
          twitter: profile._json,
          roles: ['authenticated']
        });
        user.save(function(err) {
          if (err) {
            console.log(err);
            return done(null, false, {message: 'Twitter login failed, email already used by other login strategy'});
          } else {
            return done(err, user);
          }
        });
      });
    }
  ));

  // Use facebook strategy
  passport.use(new FacebookStrategy({
      clientID: config.strategies.facebook.clientID,
      clientSecret: config.strategies.facebook.clientSecret,
      callbackURL: config.strategies.facebook.callbackURL,
      profileFields: ['id', 'displayName', 'emails']
    },
    function(accessToken, refreshToken, profile, done) {
      User.findOne({
        'facebook.id': profile.id
      }, function(err, user) {
        if (err) {
          return done(err);
        }
        if (user) {
          return done(err, user);
        }
        user = new User({
          name: profile.displayName,
          email: profile.emails[0].value,
          username: profile.username || profile.emails[0].value.split('@')[0],
          provider: 'facebook',
          facebook: profile._json,
          roles: ['authenticated']
        });
        user.save(function(err) {
          if (err) {
            console.log(err);
            return done(null, false, {message: 'Facebook login failed, email already used by other login strategy'});
          } else {
            return done(err, user);
          }
        });
      });
    }
  ));

  // Use github strategy
  passport.use(new GitHubStrategy({
      clientID: config.strategies.github.clientID,
      clientSecret: config.strategies.github.clientSecret,
      callbackURL: config.strategies.github.callbackURL
    },
    function(accessToken, refreshToken, profile, done) {
      User.findOne({
        'github.id': profile.id
      }, function(err, user) {
        if (user) {
          return done(err, user);
        }
        user = new User({
	  name: profile._json.displayName || profile._json.login,
          username: profile._json.login,
          email: profile.emails[0].value,
          provider: 'github',
          github: profile._json,
          roles: ['authenticated']
        });
        user.save(function(err) {
          if (err) {
            console.log(err);
            return done(null, false, {message: 'Github login failed, email already used by other login strategy'});
          } else {
            return done(err, user);
          }
        });
      });
    }
  ));

  // Use google strategy
  passport.use(new GoogleStrategy({
      clientID: config.strategies.google.clientID,
      clientSecret: config.strategies.google.clientSecret,
      callbackURL: config.strategies.google.callbackURL
    },
    function(accessToken, refreshToken, profile, done) {
      User.findOne({
        'google.id': profile.id
      }, function(err, user) {
        if (user) {
          return done(err, user);
        }
        user = new User({
          name: profile.displayName,
          email: profile.emails[0].value,
          username: profile.emails[0].value,
          provider: 'google',
          google: profile._json,
          roles: ['authenticated']
        });
        user.save(function(err) {
          if (err) {
            console.log(err);
            return done(null, false, {message: 'Google login failed, email already used by other login strategy'});
          } else {
            return done(err, user);
          }
        });
      });
    }
  ));

  // use linkedin strategy
  passport.use(new LinkedinStrategy({
      consumerKey: config.strategies.linkedin.clientID,
      consumerSecret: config.strategies.linkedin.clientSecret,
      callbackURL: config.strategies.linkedin.callbackURL,
      profileFields: ['id', 'first-name', 'last-name', 'email-address']
    },
    function(accessToken, refreshToken, profile, done) {
      User.findOne({
        'linkedin.id': profile.id
      }, function(err, user) {
        if (user) {
          return done(err, user);
        }
        user = new User({
          name: profile.displayName,
          email: profile.emails[0].value,
          username: profile.emails[0].value,
          provider: 'linkedin',
          linkedin: profile._json,
          roles: ['authenticated']
        });
        user.save(function(err) {
          if (err) {
            console.log(err);
            return done(null, false, {message: 'LinkedIn login failed, email already used by other login strategy'});
          } else {
            return done(err, user);
          }
        });
      });
    }
  ));

  // use SAML strategy
  
  passport.use(new SamlStrategy({
    entryPoint: config.strategies.saml.entryPoint,
    issuer: config.strategies.saml.issuer,
    callbackUrl: config.strategies.saml.callbackUrl,
    // TODO: confirm if the following three settings are necessary for any use-case
    // privateCert:  fs.readFileSync(onfig.strategies.saml.privateCert'./cert-scripts/azeem_com.key', 'utf-8'),
    // cert: fs.readFileSync(onfig.strategies.saml.cert './cert-scripts/adfs.ideawake_com_pk.crt', 'utf-8'),
    // authnContext: 'http://schemas.microsoft.com/ws/2008/06/identity/authenticationmethod/password',
    acceptedClockSkewMs: -1,
    identifierFormat: null,
    signatureAlgorithm: config.strategies.saml.callbackUrl.signatureAlgorithm,
    disableRequestedAuthnContext: true,
    cert: config.strategies.saml.cert
  },
  function(profile, done) {
    console.log('Start: Processing SAML parsed data from SSO provider.');
    let claim = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/';
    let props = [
      'upn', // adfs
      'name', // adfs
      'emailaddress', // adfs, okta
      'emailAddress',
      'nameID' // okta
    ];

    let userProfile = {};

    props.forEach(prop => {
      let value = profile[claim + prop];
      !value && (value = profile[prop]);

      if (Array.isArray(value)){
        userProfile[prop] = value[0];
      } else {
        userProfile[prop] = value;        
      }
    });

    // 'firstName', 'lastName' are from okta (keys depend on okta settings)
    profile.firstName && (
      userProfile.name = `${profile.firstName} ${profile.lastName || ''}`
    );
    
    console.log('Done: Processing SAML parsed data from SSO provider.');
    return done(null, userProfile);
  }));


  // =================================================

  passport.use('azure-oauth', new AzureOAuth2Strategy({
	  clientID: config.strategies.azure.clientID,
	  clientSecret: config.strategies.azure.clientSecret,
	  callbackURL: config.strategies.azure.callbackUri,
	  resource: config.strategies.azure.clientID,
	  tenant: config.strategies.azure.tenant,
	  state: false
	},
	function (accessToken, refreshtoken, params, profile, done) {
	  var user = jwt.decode(params.id_token, "", true);
	  done(null, user);
	}));

  // =================================================


    var db = mongoose.connection;
    var collection = db.collection('platformsettings');
    var platformSettings = {};

    platformSettings.slackapi = {};
    platformSettings.slackapi.oauth_clientId = 'what';
    platformSettings.slackapi.oauth_clientSecret = 'what';

    // TODO: sometimes on ".find()", returns an undefined, not reproduced locally
    let cursor = collection.find();
    if (cursor) {
      cursor.toArray(function(err, result) {
        // here ...
        //  console.log(platformSettings);
        if(result && result.length > 0) {
            // console.log(result[0]);
            platformSettings = result[0];
  
            if(platformSettings && platformSettings.slackapi && platformSettings.slackapi.oauth_clientId && platformSettings.slackapi.oauth_clientSecret) {
              passport.use(
              new SlackStrategy({
                clientID: platformSettings.slackapi.oauth_clientId,
                clientSecret: platformSettings.slackapi.oauth_clientSecret,
                callbackURL: config.hostname + '/api/auth/slack/callback',
                scope: "users:read"
              },
  
              function(accessToken, refreshToken, profile, done) {
                // console.log(profile);
                var slackProfile = profile._json.info.user;
                User.findOne({
                  'email': slackProfile.profile.email
                }, function(err, user) {
                  if (user) {
                    return done(err, user);
                  }
                  user = new User({
                    name: profile.displayName,
                    email: slackProfile.profile.email,
                    username: slackProfile.profile.real_name,
                    provider: 'slack',
                    slack: profile._json,
                    roles: ['authenticated']
                  });
                  user.save(function(err) {
                    if (err) {
                      console.log(err);
                      return done(null, false, {message: 'Slack login failed, email already used by other login strategy'});
                    } else {
                      return done(err, user);
                    }
                  });
                });
              }
  
            ));
  
            return passport;
          } else {
            return null;
          }
  
        } else {
  
          return null;
  
        }
        // use slack strategy
      });
    }
};
