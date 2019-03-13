const mongoose = require('mongoose');

module.exports = {
    createUserProfile: function (user, callback) {
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
}
