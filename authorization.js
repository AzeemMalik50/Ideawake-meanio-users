'use strict';
var mongoose = require('mongoose'),
  User = mongoose.model('User'),
  randtoken = require('rand-token'),
  _ = require('lodash'),
  refreshTokens = {};

const error = require('http-errors-promise');
const cache = require('cache-flex');

var findUser = exports.findUser = function(id, cb) {
  User.findOne({
    _id: id
  }, function(err, user) {
    if (err || !user) return cb(null);
    cb(user);
  });
};

const jwt = require('jsonwebtoken');
const config = require('meanio').getConfig();


/**
 * Generic require login routing middleware
 */
exports.requiresLoginCheckDb = function(req, res, next) {
  //console.log('.................................Checking auth.requiresLogin.................................');

  if (!req.isAuthenticated()) {
    return res.status(403).send('User is not authorized');
  }
  findUser(req.user._id, function(user) {
      if (!user) return res.status(403).send('User is not authorized');
      req.user = user;
      next();
  });
};

exports.requiresLogin = function requiresLogin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(403).send('User is not authorized');
  }
  next();
};

/**
 * Generic require Admin routing middleware
 * Basic Role checking - future release with full permission system
 */
exports.requiresAdmin = function(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(403).send('User is not authorized');
  }
  findUser(req.user._id, function(user) {
      if (!user) return res.status(403).send('User is not authorized');

      if (req.user.roles.indexOf('admin') === -1) return res.status(403).send('User is not authorized');
      req.user = user;
      next();
  });
};

/**
 * Generic validates if the first parameter is a mongo ObjectId
 */
exports.isMongoId = function(req, res, next) {
  if ((_.size(req.params) === 1) && (!mongoose.Types.ObjectId.isValid(_.values(req.params)[0]))) {
      return res.status(500).send('Parameter passed is not a valid Mongo ObjectId');
  }
  next();
};


exports.generateAuthToken = function(MeanUser) {
  return (req, res, next) => {
    try {
      console.log(`Start: generateAuthToken req.user ${req.user.email}`);

      // Using user.toObject() here otherwise removing stuff like 'pointsLog'
      // from the object still leaves it under user.userProfile._doc.pointsLog
      // and it ends up getting encoded as the token. toObject() is a more formal
      // way of getting the plain javascript object compared to user._doc.            
      // omitting userProfile as we no longer send userProfile in token.
      let payload = _.omit(req.user.toObject(), ['salt', 'hashed_password', 'userProfile']);
      if (req.user && req.user.userProfile && req.user.userProfile._id) {
        payload.userProfile = req.user.userProfile._id;
      } else {
        payload.userProfile = null;
      }

      if (MeanUser) {
        MeanUser.events.emit('logged_in', {
          action: 'logged_in',
          user: {
            name: req.user.name
          }
        });
      }

      (req.body.hasOwnProperty('redirect') && req.body.redirect !== false) &&
      (payload.redirect = req.body.redirect);

      req.token = jwt.sign(payload, config.secret, {expiresIn: config.tokenExpiry});

      console.log(`Done: generateAuthToken req.user ${req.user.email}`);
      next();
    } catch (err) {
      console.log(`Error: generateAuthToken req.user ${req.user.email}`);
      next(err);
    }
  }
};

/* Generating refresh token MW */
exports.generateRefreshToken = function(req, res, next) {
  try {
    let payload = { _id: req.user._id };
    let refreshToken = jwt.sign(payload, config.secret);

    req.refreshToken = refreshToken;
    next();
  } catch (err) {
    next(err);
  }
};

/* Valdating refresh token MW */
exports.validateRefreshToken = function(req, res, next) {
  req.assert('refreshToken', 'Refresh token is required!').notEmpty();

  var errors = req.validationErrors();
  
  if (errors) return res.status(400).send(errors);

  try {
    jwt.verify(req.body.refreshToken, config.secret, (err, decoded) => {
      if (err) return res.status(401).send('Malformed token.');

      let userId = decoded;

      if (!userId) return res.status(400).send('Malformed token.');

      User.findOneUser({ _id: userId }, true)
      .then(user => {
        if (!user) return res.status(401).send('User not found.');

        req.user = user;
        next();
      })
      .catch(err => next(err));
    });
  } catch (err) {
    next(err);
  }
};


exports.SAMLAuthorization = function(req, res, next) {
  console.log('Start: finding user for SSO.');
  let Invite = mongoose.model('Invite');

  // AdFS/Okta RelayState and oAuth state param to get invitationId
  let stateInvitation = {};
  if (req.body && req.body.RelayState) {
    stateInvitation = JSON.parse(req.body.RelayState);
  }
  
  if (req.query && req.query.state) {
    stateInvitation = JSON.parse(req.query.state);
  }
  const { invitationId } = stateInvitation;
  
  let email = (
    req.user.emailaddress || req.user.email ||
    req.user.emailAddress || req.user.upn || req.user.nameID
  ).toLowerCase();

  if (!email) {
    return next(new Error(
      `No identifiable user property returned by SAML provider.`
    ));
  }

  User.findOneUser({ email }, true)
    .then(user => {
      if (!user) {
        const inviteFilters = invitationId
          ? { _id: invitationId, status: 'pending' }
          : { status: 'pending', email: email };        
        Invite.findOneAndUpdate(inviteFilters, { status: 'accepted' })
          .then(invite => {
            var newUser = {
              email: email,
              name: req.user.name || 'Unknown Name',
              adfs_metadata: req.user,
              // Added default roles in case no invite found
              roles: invite && invite.roles ? invite.roles : ['authenticated']             
            };
            
            req.showSecondaryEmailPage = true;
            // if while sending invite isNotificationEmail was set to true then use invite email as notification/secondary email
            // As we are adding secondaryEmail of the user here, so lets not redirect to add-secondary-email page again.
            if (invite && invite.isNotificationEmail) {
              newUser.secondaryEmail = invite.email;
              req.showSecondaryEmailPage = false;
            }
            
            req.isUserNew = true;
            return User.createUser(newUser)
              .then(user => {
                req.user = user;
                if (!invite) return next();
                
                // if have invites then update user of invites after saml signup  
                invite.user = user;
                return invite.save()
                  .then(result => {                    
                    next();
                  })
                  .catch(err => {
                    next(err);
                  });
              })
              .catch(err => next(err));
          })
      } else {
        req.user = user;
        console.log('Done: finding user for SSO.');
        next();
      }
    }).catch(err => {
      console.log('Error creating user on SSO', err);
      next(err);
    });
};


exports.passwordValidation = function(req, res, next) {
  if (req.body && req.body.password) {
    const { password } = req.body;
    const policy = cache.getSync('password-policy') || {};

    if (policy.enableSpecialChars) {
      const regex = new RegExp(
        `[ !@#$%^&*()_+\\-=\\[\\]{};':"\\\|,.<>\\/?]`, 'g'
      );

      if ((password.match(regex) || []).length < policy.minSpecialChars) {
        return error.respond(
          res,
          null,
          `There should be at least ${policy.minSpecialChars} special characters in the password.`,
          400
        );
      }
    }

    if (policy.enableCapitals) {
      const regex = new RegExp('[A-Z]', 'g');

      if ((password.match(regex) || []).length < policy.minCapitals) {
        return error.respond(
          res,
          null,
          `There must be at least ${policy.minCapitals} capital letters in the password.`,
          400
        );
      }
    }

    if (policy.enableLength) {
      if (password.length < policy.minLength) {
        return error.respond(
          res,
          null,
          `The password must be at least ${policy.minLength} characters long`,
          400
        );
      }
    }

    next();
  } else {
    error.respond(
      res,
      null,
      'Please enter password.',
      400
    );
    next();
  }
}
