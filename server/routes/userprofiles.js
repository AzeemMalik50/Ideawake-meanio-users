'use strict';


// Article authorization helpers
var hasAuthorization = function(req, res, next) {
  if (!req.user.isAdmin && !req.userProfile.user._id.equals(req.user._id)) {
    return res.status(401).send('User is not authorized');
  }
  next();
};

var hasPermissions = function(req, res, next) {

  req.body.permissions = req.body.permissions || ['authenticated'];

  // for (var i = 0; i < req.body.permissions.length; i++) {
  //   var permission = req.body.permissions[i];
  //   if (req.acl.user.allowed.indexOf(permission) === -1) {
  //     return res.status(401).send('User not allowed to assign ' + permission + ' permission.');
  //   };
  // };

  next();
};


module.exports = function(UserProfiles, app, circles, database, io) {

  var userProfiles = require('../controllers/userprofiles')(UserProfiles);

  app.route('/api/userProfileCurrentUser').get(userProfiles.userProfileCurrentUser);

  app.route('/api/userprofiles')
    .get(userProfiles.all)
    .post(/*auth.requiresLogin,*/ hasPermissions, userProfiles.create);
  app.route('/api/userProfiles/points/add')
    .post(/*auth.requiresLogin,*/ hasPermissions, userProfiles.addPoints);
  app.route('/api/leaderboard').get(userProfiles.leaderboard);
   // .put(/*auth.isMongoId,*/ auth.requiresLogin, hasAuthorization, hasPermissions, userProfiles.update)
   // .delete(/*auth.isMongoId,*/ auth.requiresLogin, hasAuthorization, userProfiles.destroy);
  app.route('/api/userprofiles/search').get(userProfiles.search);
  app.route('/api/userprofiles/:userProfileId')
    .get(userProfiles.show)
    .put(/*auth.isMongoId, auth.requiresLogin,*/ hasAuthorization, hasPermissions, userProfiles.update)
    .delete(/*auth.isMongoId, auth.requiresLogin,*/ hasAuthorization, userProfiles.destroy);

  app.route('/api/userprofiles/fullprofile/:userProfileId').get(userProfiles.getFullProfile);

  app.route('/api/userprofiles/update/:userProfileId')
    .put(/*auth.isMongoId, auth.requiresLogin,*/ hasAuthorization, hasPermissions, userProfiles.update);
    //.delete(/*auth.isMongoId, auth.requiresLogin,*/ hasAuthorization, userProfiles.destroy);


  // Finish with setting up the articleId param
  app.param('userProfileId', userProfiles.userProfile);

};
