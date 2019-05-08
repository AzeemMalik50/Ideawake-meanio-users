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

    createUser: function(userData, settings) {
      const PlatformSetting = mongoose.model('PlatformSetting');
      const { name, email } = userData;

      if (!name) {
        return error(null, 'You must enter a name.', 400);
      }

      if (!validator.isEmail(email)) {
        return error(null, 'You must enter a valid email address.', 400);
      }

      return (settings ? Promise.resolve(settings) : PlatformSetting.get())
        .then(settings => {
          if ((settings.emailDomains || []).length) {
            const emailDomain = email.split('@').pop();
            if (settings.emailDomains.indexOf(emailDomain) === -1) {
              return error(null, 'Email not allowed.', 400);
            }
          }

          var user = new this(userData);
          user.roles ? user.roles : ['authenticated'];

          return user.save()
            .then(user => {
              return Promise.all([
                helpers.createUserProfile(user)
                .then(userProfile => {
                  user.userProfile = userProfile._id;
                  return user.save()
                    .catch(
                      err => console.log('error updating user\'s profile id.', err)
                    )
                    .then(() => {
                      user.userProfile = userProfile;
                      return user;
                    })
                  }),
                user.sendWelcomeEmail()
              ])
                .then(() => user)
                .catch(() => user);
            })
            .catch(err => {
                switch (err.code) {
                  case 11000:
                  case 11001:
                    return error(err, 'Email already taken.', 400);
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
                      return error(modelErrors, 'Some errors occurred.');
                    }
                }
                return error(err, 'Something went wrong.');
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

    signup: function({name, email, defaultLanguage, password}) {
      const PlatformSetting = mongoose.model('PlatformSetting');

      return PlatformSetting.get()
        .then(settings => {
          if (settings.inviteOnlyMode === true) {
            return error(null, 'Can sign up only through invites.', 400);
          }

          return this.createUser({name, email, defaultLanguage, password}, settings);
        });
    },

    redeemInvite: function(inviteId, {name, defaultLanguage, password}) {
      const Invites = mongoose.model('Invite');
      const Ideas = mongoose.model('Idea');

      if (!inviteId) return error(null, 'Invite id is required.', 400);

      return Invites.get({_id: inviteId})
        .then(([{_id, status, email, roles, teamIdea}]) => {
          if (status === 'accepted') {
            return error(null, 'This invite has already been accepted.', 400);
          }
      
          if (status === 'bounced') {
            return error(null, 'The invitation has expired.', 400);
          }
      
          if (status !== 'pending') {
            return error(new Error(
              `Detected invalid invitation status while redeeming '${this.id}'`
            ), 'Invalid invitation status.');
          }

          return this.createUser({name, email, defaultLanguage, password, roles})
            .tap(() => {
              return Invites.update(
                { _id: inviteId },
                { $set: { status: 'accepted' } }
              ).exec();
            })
            .then(user => {
              let teamPromise = Promise.resolve();
              if (teamIdea) {
                teamPromise = Ideas.makePendingMemberPermanent(
                  teamIdea, _id, user._id, true
                );
              }

              return teamPromise
                .then(() => ({
                  user, teamIdea
                }));
            });
        });
    }
  }
};
