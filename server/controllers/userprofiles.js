'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
    UserProfile = mongoose.model('UserProfile'),
    User = mongoose.model('User'),
    config = require('meanio').getConfig(),
    _ = require('lodash');

module.exports = function(UserProfiles, http) {

    var socket = UserProfiles.io;

    var getUserProfile = function(req, callback) {
        if(req.user && req.user._id) {

            UserProfile.findOne({'user' : req.user._id})
                .populate('user', 'name username email secondaryEmail')
                .exec(function(err, userProfile) {
                    if (err) {
                        req.log.info(err);
                        callback(err, null);
                    }  else {
                        // req.log.info(userProfiles);
                        if(userProfile && userProfile.user && userProfile.user._id) {
                            // req.log.info(userProfile);
                            // UserProfiles.events.emit('viewed', {
                            //     action: 'viewed',
                            //     user: {
                            //         name: req.user.name
                            //     },
                            //     name: userProfile.displayName,
                            //     url: config.hostname + '/user/' + userProfile.user._id
                            // });
                            // Update here

                            if(!userProfile.user.userProfile) {
                                // var user = userProfile.user;

                                User.findOne({'_id' : userProfile.user._id}).exec(function(err, user) {
                                    user.userProfile = userProfile._id;
                                    user.save(function(err) {
                                        req.log.info('Assigned user profile to user: ' + user.name);
                                    });
                                });

                            }
                            callback(null, userProfile);
                        } else {

                            req.log.info('Creating a UserProfile for User!');
                            var newUserProfile = new UserProfile();

                            User.findOne({'_id' : req.user._id}).exec(function(err, user) {

                                newUserProfile.user = user;
                                user.name = (!user.name) ? 'Unknown User' : user.name;
                                newUserProfile.displayName = user.name;
                                newUserProfile.description = user.name;
                                newUserProfile.profileImage = {};

                                newUserProfile.save(function(err) {
                                    if (err) {
                                        req.log.info(err);
                                        callback(err, null);
                                    } else {


                                        user.userProfile =  newUserProfile._id;
                                        user.save(function(error) {
                                            if(error) {
                                                req.log.info('Error saving userProfile to User object');
                                            }
                                        });
                                        UserProfiles.events.emit('created', {
                                            action: 'created',
                                            user: {
                                                name: user.name
                                            },
                                            url: config.hostname + '/user/' + newUserProfile._id,
                                            name: newUserProfile.displayName
                                        });
                                        callback(null, newUserProfile);
                                    }
                                });
                            })
                        }
                    }
                });
        } else {
            callback({error: 'Cannot find the userProfile'}, null);
        }
    };

    return {
        /**
         * Find userProfile by id
         */
        userProfile: function(req, res, next, id) {
            //req.log.info(id);
            // UserProfile.findById(id).populate("user").exec(function(err, userProfile) {
            //     if (err) return next(err);
            //     if (!userProfile) return next(new Error('Failed to load UserProfile ' + id));
            //     req.userProfile = userProfile;
            //     next();
            // });
            var oldUser;
            if(req.user) {
                oldUser = req.user;
            }
            req.user = {}; // Temporary Override the current user, this is a fucking hack.
            req.user._id = id;
            getUserProfile(req, function(err, userProfile) {
                if (err) {
                    return next(err);
                }
                if (!userProfile) return next(new Error('Failed to load UserProfile ' + id));
                req.userProfile = userProfile;
                if(oldUser && oldUser._id) {
                    req.user = oldUser;
                }
                next();
            });
        },


        userProfileCurrentUser: function(req, res) {

            if(req.user) {

                getUserProfile(req, function(err, userProfile) {
                    if (err) {

                        return res.status(500).json({
                            error: 'Cannot list the userProfile'
                        });

                    }

                    if (!userProfile) {
                        return res.status(500).json({
                            error: 'Cannot list the userProfile'
                        });
                    }

                    // req.userProfile = userProfile;

                    // req.log.info("FOUND PROFILE");

                    res.json(userProfile);

                });

            } else {

                return res.status(500).json({
                    error: 'Cannot list the userProfile'
                });

            }

        },

        userProfileTemp: function(req, res, next, id) {
            UserProfile.findById(id).populate('user', 'name username email').exec(function(err, userProfile) {
                if (err) return next(err);
                if (!userProfile) return next(new Error('Failed to load UserProfile ' + id));
                req.userProfile = userProfile;
                next();
            });
        },
        /**
         * Create an userProfile
         */
        create: function(req, res) {
            var userProfile = new UserProfile(req.body);
            userProfile.user = req.user;

            userProfile.save(function(err) {
                if (err) {
                    return res.status(500).json({
                        error: 'Cannot save the userProfile'
                    });
                }

                UserProfiles.events.emit('created', {
                    action: 'created',
                    user: {
                        name: req.user.name
                    },
                    url: config.hostname + '/user/' + userProfile.user._id,
                    name: userProfile.title
                });

                res.json(userProfile);
            });
        },
        /**
         * Update an userProfile
         */
        update: function(req, res) {

            // req.log.info('-=================================================================  WHAT DA FUCK?? -=================================================================');

            // req.log.info(req.body.userProfile);

            UserProfile.findById(req.body.userProfile._id).populate('user', 'name username').exec(function(err, userProfile) {

                if(err) {
                     return res.status(500).json({
                        error: 'Cannot save the userProfile'
                    });
                }
                
                // omit __v prop 
                req.body.userProfile = _.omit(req.body.userProfile, ['__v']);
                userProfile = _.extend(userProfile, req.body.userProfile);

                //req.log.info(userProfile);

                userProfile.save(function(err) {
                    if (err) {
                        return res.status(500).json({
                            error: 'Cannot update the userProfile'
                        });
                    }

                    UserProfiles.events.emit('updated', {
                        action: 'updated',
                        user: {
                            name: req.user.name
                        },
                        name: userProfile.title,
                        url: config.hostname + '/userprofiles/' + userProfile._id
                    });



                    User.findById(userProfile.user._id).exec(function(err, user) {

                        //if((req.body.userProfile.user.name !== userProfile.user.name) || (req.body.userProfile.user.email !== userProfile.user.email)) {
                            // req.log.info(req.body.userProfile.user);
                            user = _.extend(user, req.body.userProfile.user);

                            user.userProfile = userProfile._id;

                            user.save(function(err) {
                                if(err) {
                                    req.log.info(err);
                                }
                                if (req.body.sendWelcomeEmail) {
                                    user.sendWelcomeEmail();
                                }
                            });

                        // }
                    });



                    res.json(userProfile);
                });

            });


        },

        /**
         * Delete an userProfile
         */
        destroy: function(req, res) {
            var userProfile = req.userProfile;


            userProfile.remove(function(err) {
                if (err) {
                    return res.status(500).json({
                        error: 'Cannot delete the userProfile'
                    });
                }

                UserProfiles.events.emit('deleted', {
                    action: 'deleted',
                    user: {
                        name: req.user.name
                    },
                    name: userProfile.title
                });

                res.json(userProfile);
            });
        },
        /**
         * Show a userProfile
         */
        show: function(req, res) {
            //req.userProfile is populated from the app.param command in routes
            // which calls this.userProfile
            if(req.userProfile){
                res.json(req.userProfile);
            } else {
                res.json({'displayName' : 'Unknown User', 'user' : null});
            }
        },

        /**
         * Show a FULL userProfile
         */
        getFullProfile: function(req, res) {
            if(req.userProfile){
                //req.log.info("-==============================userProfile==========================================");
                //req.log.info(req.user);
                req.userProfile.currentUser = {};
                req.userProfile.currentUser = req.user;
                // req.log.info(req.userProfile);
                res.json({userProfile: req.userProfile, currentUser: req.user});
            } else {
                res.json({'displayName' : 'Unknown User', 'user' : null, 'currentUser' : req.user});
            }
        },


        /**
         * List of userProfile
         */
        all: function(req, res) {

            //var query = req.acl.query('UserProfile');

            UserProfile.find({}).sort('-created').populate('user', 'name username').exec(function(err, userProfile) {
                if (err) {
                    return res.status(500).json({
                        error: 'Cannot list the userProfile'
                    });
                }

                res.json(userProfile)
            });
        },
          /**
         * Update an userProfile
         */
        addPoints: function(req, res) {
           //var userProfile = req.userProfile;
            if(!req.body || !req.body.points || !parseInt(req.body.points,10) || !req.body.userId || !mongoose.Types.ObjectId.isValid(req.body.userId)) {
                return res.status(500).json({
                    error: 'Cannot add points to userProfile',
                    body : req.body
                });
            }

            UserProfile.findOneAndUpdate({'user':req.body.userId},{'$inc' : {'points' : req.body.points}},{'new':true,'upsert':true},function(err,doc){
                if (err) {
                    return res.status(500).json({
                        error: 'Cannot add points to userProfile'
                    });
                }

                var result = {
                    'date' : new Date(),
                    'total':doc.points,
                    'points':req.body.points,
                    'description':req.body.description
                }

                if(typeof doc.pointsLog === undefined) {
                    doc.pointsLog = [];
                }

                doc.pointsLog.push(result);

                doc.save(function(err) {
                    socket.emit('userPoints' + req.body.userId, result);
                    res.json(result);
                });

                //req.log.info('emitting points socket',req.body,result);
                console.log('~~~~~~~~~~~~~~~~ emitting user points socket.....');


            });
        },

        removePoints: function(req, res) {
          if(
              !req.body 
              || !req.body.points
              || !req.body.userId 
              || !mongoose.Types.ObjectId.isValid(req.body.userId)
            ) {
            return res.status(500).json({
                error: 'Cannot remove points from userProfile',
                body : req.body
            });
          }

          const points = parseInt(req.body.points) * -1;          
          UserProfile
            .findOneAndUpdate(
              { 'user': req.body.userId },
              { '$inc' : { 
                  points
                }
              },
              {
                'new': true,
                'upsert': true
              })
              .then(profile => {
                const pointLog = {
                    'date' : new Date(),
                    'total': profile.points,
                     points,
                    'description': req.body.description
                }
                if (!profile.pointsLog) profile.pointsLog = [];
                profile.pointsLog.push(pointLog);
                return profile.save();
              })
              .then(results => res.json({ success: true }))
              .catch(err => res.status(500).json({ error: err.toString() }));
        },

        leaderboard: function(req,res) {
            UserProfile.find().sort({'points':-1}).sort({'startDate':1}).limit(50)
                .populate('user', 'name username email roles')
                .exec(function(err,docs){
                if(err) {
                    console.error(err);
                    return res.status(500).json({error:'cannot retrieve leaderboard'});
                }
                //only return non admins
                var users = [];
                docs.forEach(function(doc) {
                  if (doc.user && doc.user.roles && doc.user.roles.indexOf('admin') === -1) {
                    users.push(doc);
                  }
                });
                res.json(users);
            });
        },
        search: function(req, res) {

            /* jshint ignore:start */
            UserProfile.find(
                {displayName: {$regex:req.query['query'], $options:"i"}})
                .populate("user").limit(100).exec(
                function(err,result){
                  if(err){
                    req.log.info(err);
                    return res.status(500).json({error:'cannot search users'});
                  }
                  res.json(result);
            });
            /* jshint ignore:end */
        },

        updateDemographicsAndLanguage: function(req, res) {
            req.userProfile.updateDemographicsAndLanguage(
                req.body.demographics || {},
                req.body.language
            ).then(() => res.json(req.userProfile))
            .catch(err => res.status(500).json({
                err,
                message: 'Error updating demographics.'
            }));
        }

    };
};
