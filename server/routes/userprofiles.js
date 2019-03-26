'use strict';


// Article authorization helpers
var hasAuthorization = function(req, res, next) {
  if (!req.user.isAdmin && !req.userProfile.user._id.equals(req.user._id)) {
    return res.status(403).send('User is not authorized');
  }
  next();
};

var hasPermissions = function(req, res, next) {

  req.body.permissions = req.body.permissions || ['authenticated'];

  // for (var i = 0; i < req.body.permissions.length; i++) {
  //   var permission = req.body.permissions[i];
  //   if (req.acl.user.allowed.indexOf(permission) === -1) {
  //     return res.status(403).send('User not allowed to assign ' + permission + ' permission.');
  //   };
  // };

  next();
};


module.exports = function(UserProfiles, app, circles, database, io) {

  var userProfiles = require('../controllers/userprofiles')(UserProfiles);
  const authMWs = require('../../authorization');

  app.route('/api/userprofiles')
  .get(authMWs.requiresAdmin, userProfiles.all)
  .post(authMWs.requiresAdmin, userProfiles.create);

  app.route('/api/userprofiles/me')
    .get(authMWs.requiresLogin, userProfiles.userProfileCurrentUser);

  app.route('/api/userProfiles/points/add')
    .post(authMWs.requiresLogin, userProfiles.addPoints);

  app.route('/api/userProfiles/points/remove')
    .post(authMWs.requiresLogin, hasPermissions, userProfiles.removePoints);

  app.route('/api/leaderboard')
    .get(authMWs.requiresLogin, userProfiles.leaderboard);

  app.route('/api/userprofiles/search')
    .get(authMWs.requiresLogin, userProfiles.search);

  app.route('/api/userprofiles/:userProfileId')
    .get(userProfiles.show)
    .put(/*auth.isMongoId, auth.requiresLogin,*/ hasAuthorization, hasPermissions, userProfiles.update)
    .delete(/*auth.isMongoId, auth.requiresLogin,*/ hasAuthorization, userProfiles.destroy);

  app.route('/api/userprofiles/fullprofile/:userProfileId')
    .get(authMWs.requiresAdmin, userProfiles.getFullProfile);

  app.route('/api/userprofiles/update/:userProfileId')
    .put(/*auth.isMongoId, auth.requiresLogin,*/ hasAuthorization, hasPermissions, userProfiles.update);
    //.delete(/*auth.isMongoId, auth.requiresLogin,*/ hasAuthorization, userProfiles.destroy);

  app.route('/api/userprofiles/:userProfileId/demographics')
    .put(hasAuthorization, userProfiles.updateDemographicsAndLanguage);

  // Finish with setting up the articleId param
  app.param('userProfileId', userProfiles.userProfile);

};
