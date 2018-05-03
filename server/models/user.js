'use strict';

/**
 * Module dependencies.
 */
var mongoose  = require('mongoose'),
  Schema    = mongoose.Schema,
  crypto    = require('crypto'),
  _   = require('lodash');

const Promise = require('bluebird');

/**
 * Validations
 */
var validatePresenceOf = function(value) {
  // If you are authenticating by any of the oauth strategies, don't validate.
  return (this.provider && this.provider !== 'local') || (value && value.length);
};

/**
 * Generates Mongoose uniqueness validator
 *
 * @param string modelName
 * @param string field
 * @param boolean caseSensitive
 *
 * @return function
 **/
function unique(modelName, field, caseSensitive) {
  return function(value, respond) {
    if(value && value.length) {
      var query = mongoose.model(modelName).where(field, new RegExp('^'+value+'$', caseSensitive ? 'i' : undefined));
      if(!this.isNew)
        query = query.where('_id').ne(this._id);
      query.count(function(err, n) {
        respond(n<1);
      });
    }
    else
      respond(false);
  };
}


function createUserProfile(user, callback) {
  var UserProfile = mongoose.model('UserProfile');
  
  UserProfile.find({'user': user._id}).exec(function(err, results) {
    if (results && results.length > 0) {
      callback(results[0]._id);
    } else {
      console.log('~~~~~~~~~~~~~~Creating a UserProfile for User!~~~~~~~~~~~~');
      var newUserProfile = new UserProfile();
      newUserProfile.user = user._id;
      user.name = (!user.name) ? 'Unknown User' : user.name;
      newUserProfile.displayName = user.name;
      newUserProfile.description = user.name;
      newUserProfile.defaultLanguage = user.defaultLanguage;
      newUserProfile.profileImage = {};
      newUserProfile.save(function(err) {
        if (err) {
          console.log(err);
          callback(null);
        } else {
          console.log('Created new user profile');
          callback(newUserProfile);
        }
      });
    }
   });
}


// var validateUniqueEmail = function(value, callback) {
//   var User = mongoose.model('User');
//   User.find({
//     $and: [{
//       email: toLower(value)
//     }, {
//       _id: {
//         $ne: this._id
//       }
//     }]
//   }, function(err, user) {
//     callback(err || user.length === 0);
//   });
// };

// function toLower (v) {
//   return v.toLowerCase();
// }

function toLower (v) {
  if(typeof v !== 'undefined') {
    return v.toLowerCase();
  } else {
    return '';
  }
}

/**
 * Getter
 */
var escapeProperty = function(value) {
  return _.escape(value);
};

var schemaOptions = { timestamps: true };
/**
 * User Schema
 */

var UserSchema = new Schema({
  name: {
    type: String,
    required: true,
    get: escapeProperty
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    set: toLower,
    get: toLower,
    // Regexp to validate emails with more strict rules as added in tests/users.js which also conforms mostly with RFC2822 guide lines
    match: [/^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/, 'Please enter a valid email'],
    validate: [unique('User', 'email'), 'E-mail address is already in-use']
  },
  secondaryEmail: {
    type: String,    
    unique: true,
    sparse: true,
    trim: true,
    set: toLower,
    get: toLower,
    // Regexp to validate emails with more strict rules as added in tests/users.js which also conforms mostly with RFC2822 guide lines
    match: [/^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/, 'Please enter a valid email'],
    validate: [unique('User', 'secondaryEmail'), 'secondary E-mail address is already in-use']
  },
  username: {
    type: String,
    unique: true,
    required: false,
    get: escapeProperty
  },
  roles: {
    type: Array,
    default: ['authenticated', 'anonymous']
  },
  hashed_password: {
    type: String,
    validate: [validatePresenceOf, 'Password cannot be blank']
  },
  provider: {
    type: String,
    default: 'local'
  },
  tours: {
    challengeView: {
      type: Boolean,
      default: true // false means tour was seen
    },
    challengeList: {
      type: Boolean,
      default: true
    }
  },
  salt: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  profile: {},
  facebook: {},
  twitter: {},
  github: {},
  google: {},
  linkedin: {},
  userProfile : {
    type: Schema.ObjectId,
    ref: 'UserProfile'
  },
  deleted: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  adfs_metadata: {}
}, schemaOptions);


UserSchema.statics.load = function(id, cb) {
  this.findOne({
    _id: id
  })
  .populate('userProfile')
  .exec(cb);
};


UserSchema.statics.findOneUser = function(query, resolveIfNotFound) {
  return this.findOne(query)
  .populate('userProfile')
  .exec()
  .then(user => {
    return user ?
      user : (resolveIfNotFound ? undefined : Promise.reject('Unknown user'));
  });
};

UserSchema.statics.createUser = function(userData, done) {
  var user = new this(userData);
  user.roles ? user.roles : ['authenticated'];

  user.save(function(err) {
    if (err) {
      switch (err.code) {
        case 11000:
        case 11001:
          return done([{
            msg: 'Email or username already taken',
            param: 'username'
          }]);
          break;
        default:
          var modelErrors = [];

          if (err.errors) {
            for (var x in err.errors) {
              modelErrors.push({
                param: x,
                msg: err.errors[x].message,
                value: err.errors[x].value
              });
            }
            return done(modelErrors);
          }
      }
      return done(err);
    }

    createUserProfile(user, function(userProfile) {
      user.userProfile = userProfile._id;
      user.save()
      .catch(err => console.log('error updating user\'s profile id.', err))
      .finally(() => {
        user.userProfile = userProfile;
        done(null, user)
      });
    });
  });
};

UserSchema.statics.findAndAuthenticate = function(query, password) {
  return this.findOneUser(query)
  .then(user => {
    return user.authenticate(password) ?
      Promise.resolve(user) : Promise.reject('Invalid password');
  });
};


/**
 * Virtuals
 */
UserSchema.virtual('password').set(function(password) {
  this._password = password;
  this.salt = this.makeSalt();
  this.hashed_password = this.hashPassword(password);
}).get(function() {
  return this._password;
});

/**
 * Pre-save hook
 */
UserSchema.pre('save', function(next) {
  var self = this;
  if (this.isNew && this.provider === 'local' && this.password && !this.password.length) {
    return next(new Error('Invalid password'));
  }
  // generate username from email
  if (!self.username) {
    self.username = this.email.split('@')[0];
  }
  next();

});

/**
 * Methods
 */

/**
 * HasRole - check if the user has required role
 *
 * @param {String} plainText
 * @return {Boolean}
 * @api public
 */
UserSchema.methods.hasRole = function(role) {
  var roles = this.roles;
  return roles.indexOf('admin') !== -1 || roles.indexOf(role) !== -1;
};

/**
 * IsAdmin - check if the user is an administrator
 *
 * @return {Boolean}
 * @api public
 */
UserSchema.methods.isAdmin = function() {
  return this.roles.indexOf('admin') !== -1;
};

/**
 * Authenticate - check if the passwords are the same
 *
 * @param {String} plainText
 * @return {Boolean}
 * @api public
 */
UserSchema.methods.authenticate = function(plainText) {
  return this.hashPassword(plainText) === this.hashed_password;
};

/**
 * Make salt
 *
 * @return {String}
 * @api public
 */
UserSchema.methods.makeSalt = function() {
  return crypto.randomBytes(16).toString('base64');
};

/**
 * Hash password
 *
 * @param {String} password
 * @return {String}
 * @api public
 */
UserSchema.methods.hashPassword = function(password) {
  if (!password || !this.salt) return '';
  var salt = new Buffer(this.salt, 'base64');
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('base64');
};

/**
 * Hide security sensitive fields
 *
 * @returns {*|Array|Binary|Object}
 */
UserSchema.methods.toJSON = function() {
  var obj = this.toObject();
  delete obj.hashed_password;
  delete obj.salt;
  return obj;
};

mongoose.model('User', UserSchema);
