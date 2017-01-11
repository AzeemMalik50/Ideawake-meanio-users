'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
  User = mongoose.model('User'),
  UserProfile = mongoose.model('UserProfile'),
  async = require('async'),
  config = require('meanio').getConfig(),
  crypto = require('crypto'),
  nodemailer = require('nodemailer'),
  mandrillTransport = require('nodemailer-mandrill-transport'),
  templates = require('../template'),
  _ = require('lodash'),
  jwt = require('jsonwebtoken'); //https://npmjs.org/package/node-jsonwebtoken

/**
 * Send reset password email
 */
function sendMail(mailOptions) {
    var transport = nodemailer.createTransport(mandrillTransport(config.mailer));
    transport.sendMail(mailOptions, function(err, response) {
        if (err) return err;
        return response;
    });
}

function createUserProfile(user, callback) {
    UserProfile.find({'user' : user._id}).exec(function(err, results){
        console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~Creating a UserProfile for User!~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
        if(results && results.length > 0) {
            callback(results[0]);
        } else {
            var newUserProfile = new UserProfile();
            newUserProfile.user = user._id;
            user.name = (!user.name) ? 'Unknown User' : user.name;
            newUserProfile.displayName = user.name;
            newUserProfile.description = user.name;
            newUserProfile.profileImage = {};
            newUserProfile.save(function(err) {
                if (err) {
                    console.log(err);
                    callback(null);
                } else {
                    console.log('Created new user profile');
                    user.userProfile =  newUserProfile._id;
                    user.save(function(error) {
                        if(error) {
                            console.log('Error saving userProfile to User object');
                        }
                    });
                    callback(newUserProfile);
                }
            });
        }
     });
};


module.exports = function(MeanUser) {
    return {
        /**
         * Auth callback
         */
        authCallback: function(req, res) {
            var payload = req.user;
            var escaped = JSON.stringify(payload);
            escaped = encodeURI(escaped);
            // We are sending the payload inside the token
            var token = jwt.sign(escaped, config.secret);

            res.cookie('token', token);

            var destination = req.redirect || config.strategies.landingPage;

            if(!req.cookies.redirect) {
                res.cookie('redirect', destination);
                res.redirect(destination);
            }
        },

        /**
         * Show login form
         */
        signin: function(req, res) {
          if (req.isAuthenticated()) {
            return res.redirect('/');
          }
          res.redirect(config.public.loginPage);
        },

        /**
         * Logout
         */
        signout: function(req, res) {

            MeanUser.events.emit('logged_out', {
                action: 'logged_out',
                user: req.user
            });

            req.logout();
            res.redirect('/');
        },

        /**
         * Session
         */
        session: function(req, res) {
          res.redirect('/');
        },
        /**
         * Update user
         */
        update: function(req, res) {
          var user = new User(req.body);

          user.save(function(err) {
            if (err) {
              switch (err.code) {
                case 11000:
                case 11001:
                  res.status(400).json([{
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

                    res.status(400).json(modelErrors);
                  }
              }
              return res.status(400);
            }

            // var payload = user;
            // payload.redirect = req.body.redirect;
            // var escaped = JSON.stringify(payload);
            // escaped = encodeURI(escaped);
            // req.logIn(user, function(err) {
            //   if (err) { return next(err); }
            //
            //   MeanUser.events.emit('created', {
            //     action: 'created',
            //     user: {
            //       name: req.user.name,
            //       username: user.username,
            //       email: user.email
            //     }
            //   });
            //
            //   // We are sending the payload inside the token
            //   var token = jwt.sign(escaped, config.secret, { expiresInMinutes: 60*5 });
            //   res.json({
            //     token: token,
            //     redirect: config.strategies.landingPage
            //   });
            // });
            res.status(200);
          });
        },

        /**
         * Create user
         */
        create: function(req, res, next) {
            var user = new User(req.body);

            user.provider = 'local';

            // because we set our user.provider to local our models/user.js validation will always be true
            req.assert('name', 'You must enter a name').notEmpty();
            req.assert('email', 'You must enter a valid email address').isEmail();
            req.assert('password', 'Password must be between 6-100 characters long').len(6, 100);
            // req.assert('username', 'Username cannot be more than 20 characters').len(1, 20);
            // req.assert('confirmPassword', 'Passwords do not match').equals(req.body.password);

            var errors = req.validationErrors();
            if (errors) {
                return res.status(400).send(errors);
            }

            user.roles ? user.roles : ['authenticated'];
            user.save(function(err) {
                if (err) {
                    switch (err.code) {
                        case 11000:
                        case 11001:
                        res.status(400).json([{
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

                            res.status(400).json(modelErrors);
                        }
                    }
                    return res.status(400);
                }

                if(user.userProfile === null) {
                    createUserProfile(user, function(ret) {
                        var payload = user;
                        user.userProfile = ret;
                        payload.redirect = req.body.redirect;
                        var escaped = JSON.stringify(payload);
                        escaped = encodeURI(escaped);
                        req.logIn(user, function(err) {
                            if (err) { return next(err); }

                            MeanUser.events.emit('created', {
                                action: 'created',
                                user: {
                                    name: req.user.name,
                                    username: user.username,
                                    email: user.email
                                }
                            });

                            // We are sending the payload inside the token
                            var token = jwt.sign(escaped, config.secret);
                            res.json({
                              token: token,
                              redirect: config.strategies.landingPage
                            });
                        });
                    });
                } else {
                    var payload = user;
                    payload.redirect = req.body.redirect;
                    var escaped = JSON.stringify(payload);
                    escaped = encodeURI(escaped);
                    req.logIn(user, function(err) {
                        if (err) { return next(err); }

                        MeanUser.events.emit('created', {
                            action: 'created',
                            user: {
                                name: req.user.name,
                                username: user.username,
                                email: user.email
                            }
                        });

                        // We are sending the payload inside the token
                        var token = jwt.sign(escaped, config.secret);
                        res.json({
                          token: token,
                          redirect: config.strategies.landingPage
                        });
                    });
                    res.status(200);
                }


            });
        },
        loggedin: function (req, res) {
            if (!req.isAuthenticated()) return res.send('0');
            User.findById(req.user._id)
                .populate('userProfile')
                .exec(function (err, user) {
                    if (err) return next(err);
                    if(user.userProfile === null) {
                        createUserProfile(user, function(profile) {
                            user.userProfile = profile;
                            res.send(user ? user : '0');
                        });
                    } else {
                        res.send(user ? user : '0');
                    }
                });
        },
        /**
         * Send User
         */
        me: function(req, res) {
            if (!req.user) return res.send(null);

            if(req.user.userProfile === null) {
                createUserProfile(req.user, function(profile) {
                    if(!req.refreshJWT) {
                        req.user.userProfile = profile;
                        return res.json(req.user);
                    } else {
                        req.user.userProfile = profile;
                        var payload = req.user;
                        var escaped = JSON.stringify(payload);
                        escaped = encodeURI(escaped);
                        var token = jwt.sign(escaped, config.secret);
                        res.json({ token: token });
                    }
                });
            } else {
                if(!req.refreshJWT) {
                    return res.json(req.user);
                } else {
                    var payload = req.user;
                    var escaped = JSON.stringify(payload);
                    escaped = encodeURI(escaped);
                    var token = jwt.sign(escaped, config.secret);
                    res.json({ token: token });
                }
            }

        },

        /**
         * Find user by id
         */
        user: function(req, res, next, id) {
            User.findOne({
                _id: id
            })
            .populate('userProfile')
            .exec(function(err, user) {
                if (err) return next(err);
                if (!user) return next(new Error('Failed to load User ' + id));
                req.profile = user;
                next();
            });
        },
        search: function(req,res) {
          var searchObj = {};
          if(req.query.hasRole){
            searchObj.roles = {$in :[req.query.hasRole]};
          }
          console.log('user.searchObj', searchObj, req.query);
          User.find(searchObj).sort('username')
            .populate('userProfile')
            .exec(function(err, users){
                res.send(users);
          });
        },
        /**
       * Loads a user into the request
       */
        loadUser: function(req, res, next) {
            if (!req.isAuthenticated()) {
                return next();
            }

            req.refreshJWT = false;

            User.findOne({
                _id: req.user._id
            })
            .populate('userProfile').exec(function(err, user) {
                if (err || !user) {
                    delete req.user;
                    return next();
                } else {
                    var dbUser = user.toJSON();
                    var id = req.user._id;

                    delete dbUser._id;
                    delete req.user._id;

                    var eq = _.isEqual(dbUser, req.user);
                    if (!eq) {
                        req.refreshJWT = true;
                    }

                    req.user = user;
                    next();
                }
            });
        },

        /**
         * Resets the password
         */

        resetpassword: function(req, res, next) {
            User.findOne({
                resetPasswordToken: req.params.token,
                resetPasswordExpires: {
                    $gt: Date.now()
                }
            }).populate('userProfile').exec(function(err, user) {
                if (err) {
                    return res.status(400).json({
                        msg: err
                    });
                }
                if (!user) {
                    return res.status(400).json({
                        msg: 'Token invalid or expired'
                    });
                }
                req.assert('password', 'Password must be between 8-20 characters long').len(8, 20);
                req.assert('confirmPassword', 'Passwords do not match').equals(req.body.password);
                var errors = req.validationErrors();
                if (errors) {
                    return res.status(400).send(errors);
                }
                user.password = req.body.password;
                user.resetPasswordToken = undefined;
                user.resetPasswordExpires = undefined;
                user.save(function(err) {
                    var escaped = JSON.stringify(user);
                        escaped = encodeURI(escaped);
                    var token = jwt.sign(escaped, config.secret);
                    var destination = req.redirect || config.strategies.landingPage;

                    MeanUser.events.emit('reset_password', {
                        action: 'reset_password',
                        user: {
                            name: user.name
                        }
                    });

                    req.logIn(user, function(err) {
                        if (err) return next(err);
                        res.cookie('redirect', destination);
                        return res.send({
                            user: user,
                            token: token,
                            redirect: destination
                        });
                    });
                });
            });
        },

        /**
         * Callback for forgot password link
         */
        forgotpassword: function(req, res, next) {
            async.waterfall([

                function(done) {
                    crypto.randomBytes(20, function(err, buf) {
                        var token = buf.toString('hex');
                        done(err, token);
                    });
                },
                function(token, done) {
                    User.findOne({
                        $or: [{
                            email: req.body.text
                        }, {
                            username: req.body.text
                        }]
                    }, function(err, user) {
                        if (err || !user) return done(true);
                        done(err, user, token);
                    });
                },
                function(user, token, done) {
                    user.resetPasswordToken = token;
                    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
                    user.save(function(err) {
                        done(err, token, user);
                    });
                },
                function(token, user, done) {
                    var mailOptions = {
                        to: user.email,
                        from: config.emailFrom
                    };
                    mailOptions = templates.forgot_password_email(user, req, token, mailOptions);
                    sendMail(mailOptions);
                    done(null, user);
                }
            ],
            function(err, user) {

                var response = {
                    message: 'Mail successfully sent',
                    status: 'success'
                };
                if (err) {
                    response.message = 'User does not exist';
                    response.status = 'danger';

                }
                MeanUser.events.emit('forgot_password', {
                    action: 'forgot_password',
                    user: {
                        name: req.body.text
                    }
                });
                res.json(response);
            });
        }
    };
}

