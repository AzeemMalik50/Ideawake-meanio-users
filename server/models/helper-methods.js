const mongoose = require('mongoose');
const error = require('http-errors-promise');

module.exports = {
    createUserProfile: function (user) {
      var UserProfile = mongoose.model('UserProfile');
      
      return UserProfile.findOne({'user': user._id})
        .exec()
        .then(function(result) {
          if (result) return result;
          else {
            console.log('~~~~~~Creating a UserProfile for User!~~~~~~');
            var newUserProfile = new UserProfile();
            newUserProfile.user = user._id;
            user.name = (!user.name) ? 'Unknown User' : user.name;
            newUserProfile.displayName = user.name;
            newUserProfile.description = user.name;
            newUserProfile.defaultLanguage = user.defaultLanguage;
            newUserProfile.profileImage = {};

            return newUserProfile.save()
              .catch(err => error(err, 'Error creating profile.'));
          }
        })
        .catch(err => error(err, 'Error fetching profile.'));
    }
}
