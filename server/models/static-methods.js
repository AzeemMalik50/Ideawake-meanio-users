const error = require('http-errors-promise')
const mongoose = require('mongoose');
const helpers = require('./helper-methods');
const validator = require('express-validator').validator;

module.exports = {
  user: {
    load: function(id, cb) {
      this.findOne({
        _id: id
      })
        .populate('userProfile')
        .exec(cb);
    },

    findOneUser: function(query, resolveIfNotFound) {
      return this.findOne(query)
        .select('+hashed_password +salt')
        .populate('userProfile')
        .exec()
        .then(user => {
          return user ?
            user : (
              resolveIfNotFound ? undefined : Promise.reject('Unknown user')
            );
        });
    },

    createUser: function(userData, done) {
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
    
        helpers.createUserProfile(user, function(userProfile) {
          user.userProfile = userProfile._id;
          user.save()
            .catch(
              err => console.log('error updating user\'s profile id.', err)
            )
            .finally(() => {
              user.userProfile = userProfile;
              done(null, user);
            });
        });
      });
    },

    findAndAuthenticate: function(query, password) {
      return this.findOneUser(query)
      .then(user => {
        return user.authenticate(password) ?
          Promise.resolve(user) : Promise.reject('Invalid password');
      });
    },

    signup: function({name, email, defaultLanguage}) {
        var PlatformSetting = mongoose.model('PlatformSetting');

        return PlatformSetting.get()
          .then(settings => {
            if (settings.inviteOnlyMode === true) {
              return error(null, 'Can sign up only through invites.', 400);
            }

            if (!name) {
              return error(null, 'You must enter a name.', 400);
            }

            if (!validator.isEmail(email)) {
              return error(null, 'You must enter a valid email address.', 400);
            }

            if (settings.emailDomains.length) {
              const emailDomain = email.split('@').pop();
              if (settings.emailDomains.indexOf(emailDomain) === -1) {
                return error(null, 'Email not allowed.', 400);
              }
            }

            return new Promise((resolve, reject) => {
              this.createUser({name, email, defaultLanguage}, (err, user) => {
                if (err) return reject(
                  error(err, 'Error creating user.', 500, true)
                );

                resolve(user);
              });
            });
          });
    }
  }
};
