'use strict';
var mongoose = require('mongoose'),
  User = mongoose.model('User'),
  UserProfile = mongoose.model('UserProfile'),
  randtoken = require('rand-token'),
  _ = require('lodash'),
  refreshTokens = {};


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
  //console.log(".................................Checking auth.requiresLogin.................................");

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
      console.log(`generateAuthToken req.user ${req.user} vs req.user._doc ${req.user._doc}`);
      console.log(`generateAuthToken req.user.userProfile ${req.user.userProfile}`);

      // Using user.toObject() here otherwise removing stuff like 'pointsLog'
      // from the object still leaves it under user.userProfile._doc.pointsLog
      // and it ends up getting encoded as the token. toObject() is a more formal
      // way of getting the plain javascript object compared to user._doc.            
      // omitting userProfile as we no longer send userProfile in token.
      let payload = _.omit(req.user.toObject(), ['salt', 'hashed_password', 'userProfile']);
      if (req.user && req.user.userProfile && req.user.userProfile._id) {
        payload.userProfile = req.user.userProfile._id;
      } else {
        function setProfile(profile) {
          payload.userProfile = profile;
        }
        createUserProfile(MeanUser, setProfile);
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

      next();
    } catch (err) {
      next(err);
    }
  }
};

function createUserProfile(MeanUser, callback) {
  UserProfile.find({ 'user': user._id }).exec(function (err, results) {
    if (results && results.length > 0) {
      callback(results[0]);
    } else {
      console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~Creating a UserProfile for User!~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
      var newUserProfile = new UserProfile();
      newUserProfile.user = user._id;
      user.name = (!user.name) ? 'Unknown User' : user.name;
      newUserProfile.displayName = user.name;
      newUserProfile.description = user.name;
      newUserProfile.defaultLanguage = user.defaultLanguage || 'en-US';
      newUserProfile.profileImage = {};
      newUserProfile.save(function (err) {
        if (err) {
          console.log(err);
          return;
        } else {
          console.log('Created new user profile');
          user.userProfile = newUserProfile._id;
          user.save(function (error) {
            if (error) {
              console.log('Error saving userProfile to User object');
            }
          });
          callback(newUserProfile._id);
        }
      });
    }
  });

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
  let Invite = mongoose.model('Invite');
  User.findOneUser({email: req.user.upn.toLowerCase()}, true)
  .then(user => {
    if (!user) {
      Invite.findOneAndUpdate({ status: 'pending', email: req.user.upn.toLowerCase() }, { status: 'accepted' })
        .then(invite => {
          console.log(invite)
          var newUser = {
            email: req.user.upn,
            name: req.user.name,
            adfs_metadata: req.user,
            // Added default roles in case no invite found
            roles:  invite && invite.roles ? invite.roles : ['authenticated']
          };
          req.isUserNew = true;
          return User.createUser(newUser, function(err, user){
            if (err) {
               throw err;
            } else {
              req.user = user;
              next();
            }
          });
        })
    } else {
      req.user = user;    
      next()
    }
  }).catch(err => {
    console.log('Error creating user on SSO', err);
    next(err);
  });
};
