const error = require('http-errors-promise');
const helpers = require('./helper-methods');

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
    }
  }
};
