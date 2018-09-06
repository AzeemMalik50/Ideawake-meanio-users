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

const EmailTemplate = require('email-templates').EmailTemplate;
const path = require('path');

function sendByTemplate(template, contextOptions, mailOptions, cb) {
  let emailLogoUrl = 'https://gallery.mailchimp.com/a4ba02972580aa81f393d12ad/images/cc42f469-c38a-44b6-934f-855ba91adb98.png';
  const PlatformSettings = mongoose.model('PlatformSetting');
  PlatformSettings.findOne({}, function(err, settings){
    if (err) cb(err);
    emailLogoUrl = settings.emailLogo && settings.emailLogo.url 
      ? settings.emailLogo.url : emailLogoUrl;
    emailLogoUrl = encodeURI(emailLogoUrl);
    const defaultContextOptions = {
      hostname: config.hostname || process.env.HOST_NAME,
      companyName: process.env.COMPANY_NAME,
      nl2br: function(str) { return str.replace(/\r|\n|\r\n/g, '<br />') },
      settings: {
          views: path.join(config.root, '/packages/custom/mailer/templates/')
      },
      emailLogoUrl
    };
    const { to, from, subject } = mailOptions;
    const defaultMailOptions = {
      to,
      from,
      subject,
      track_opens: true,
      track_clicks: false, 
    };  
    const templateDir = 
      path.join(config.root, '/packages/custom/mailer/templates/', template);
    const email = new EmailTemplate(templateDir);
    email.render(
      _.merge(defaultContextOptions, contextOptions),
      function(err, result) {
        if (err) {
            console.log(`>>>> ======================= EmailTemplates error ======================= >>>>`, template, err);
            cb('Error processing email template');
            // return;
        } else {                            
          const options = _.merge(defaultMailOptions, {
            html: result.html,
            text: result.text
          });        
          sendMail(options, function(err, response) {
            if(err) console.log('Error in Sending Reset Password Email', err);
          });
          cb();
        }
      }
    );
  });  
}

/**
 * Send reset password email
 */
function sendMail(mailOptions, cb) {    
    var transport = nodemailer.createTransport(mandrillTransport(config.mailer));    
    transport.sendMail(mailOptions, function(err, response) {
        if(err) {
          cb(err);
        } else {
          cb(null, response);
        }
    });
}

function createUserProfile(user, callback) {
    UserProfile.find({'user' : user._id}).exec(function(err, results){
        if(results && results.length > 0) {
            callback(results[0]);
        } else {
            console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~Creating a UserProfile for User!~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
            var newUserProfile = new UserProfile();
            newUserProfile.user = user._id;
            user.name = (!user.name) ? 'Unknown User' : user.name;
            newUserProfile.displayName = user.name;
            newUserProfile.description = user.name;
            newUserProfile.defaultLanguage = user.defaultLanguage || 'en-US';
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
}

function updateLastSeenTime(user, callback) {
    var update = false;
    var now = new Date().getTime();;

    if(typeof user.lastSeen === undefined) {
        user.lastSeen = now;
        update = true;
    } else {
        console.log('New Date', now);
        console.log('Old Date', user.lastSeen.getTime())
        if((now) - user.lastSeen.getTime() > config.userLastSeenTimeout){
            user.lastSeen = now;
            update = true;
        }
    }

    if(update) {
        console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Updating ' + (user.name || user.username) + ' Last Seen to: ', user.lastSeen);
        user.save(function(err) {
            callback(user);
        });
    } else {
        callback(user);
    }
}


module.exports = function(MeanUser) {
    return {
        /**
         * Auth callback
         */
        authCallback: function(req, res) {
            var payload = req.user && req.user._doc ? req.user._doc : req.user;
            /* var escaped = JSON.stringify(payload);
            escaped = encodeURI(escaped); */
            // We are sending the payload inside the token
            let cleansedProfile = _.omit(payload.userProfile._doc ? payload.userProfile._doc : payload.userProfile, ['pointsLog']);
            payload.userProfile = cleansedProfile;
            var token = jwt.sign(payload, config.secret, {expiresIn: config.tokenExpiry});
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

            var db = mongoose.connection;
            var collection = db.collection('platformsettings');
            var platformSettings = {};

            collection.find().toArray(function(err, result) {
                if (result && result.length > 0) {
                    platformSettings = result[0];
                    if (platformSettings.inviteOnlyMode === true && req.body.inviteId === null) {
                        console.log('BAILING OUT!!!!!');
                        return res.status(400);
                    }
                    req.body.provider = 'local';

                    // because we set our user.provider to local our models/user.js validation will always be true
                    req.assert('name', 'You must enter a name').notEmpty();
                    req.assert('email', 'You must enter a valid email address').isEmail();
                    req.assert('password', 'Password must be between 6-100 characters long').len(6, 100);
                    // req.assert('username', 'Username cannot be more than 20 characters').len(1, 20);
                    // req.assert('confirmPassword', 'Passwords do not match').equals(req.body.password);                    


                    var errors = req.validationErrors();
                    
                    const platFormEmailDomains = platformSettings.emailDomains;
                    if (platFormEmailDomains && platFormEmailDomains.length) {
                        const emailDomain = req.body.email.split('@').pop();
                        if (platFormEmailDomains.indexOf(emailDomain) === -1) {
                            errors = errors || [];
                            errors.push({
                              param: 'email',
                              msg: 'Email not allowed',
                              value: req.body.email
                          });
                        }
                    }

                    if (errors) {
                        return res.status(400).send(errors);
                    }


                    User.createUser(req.body, function(err, user) {
                        if (err) {
                            return res.status(400).json(err);
                        } else {
                            req.user = user;

                            MeanUser.events.emit('created', {
                                action: 'created',
                                user: {
                                    name: user.name,
                                    username: user.username,
                                    email: user.email
                                }
                            });

                            if (req.body && req.body.redirect) {
                                req.redirect = req.body.redirect
                            }

                            next();
                        }
                    });
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
                            let cleansedProfile = _.omit(profile, ['pointsLog']);
                            user.userProfile = cleansedProfile;
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
           // updateLastSeenTime(req.user, function(updatedUser) { // moved to platformsettings
                createUserProfile(req.user, function(profile) {
                    let cleansedProfile = _.omit(profile, ['pointsLog']);
                    req.user.userProfile = cleansedProfile;
                    return res.json(req.user);

                    //  Follwing was used in case when db has updated but token still has old values. but as for now we are not
                    //  decoding token on front-end, this is not needed.

                    // if(!req.refreshJWT) {
                    //     req.user.userProfile = cleansedProfile;
                    //     return res.json(req.user);
                    // } else {

                    //     req.user.userProfile = cleansedProfile;
                    //     let toEncode = req.user && req.user._doc ? req.user._doc : req.user;
                    //     let payload = _.omit(toEncode, ['salt', 'hashed_password']);
                    //     payload.userProfile = _.omit(payload.userProfile._doc ? payload.userProfile._doc : payload.userProfile, ['pointsLog']);
                    //    /*  var escaped = JSON.stringify(payload);
                    //     escaped = encodeURI(escaped); */
                    //     var token = jwt.sign(payload, config.secret, {expiresIn: config.tokenExpiry});
                    //     res.json({ token: token });
                    // }
                });
           // });
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
					const pageNum = req.body.pageNum || 1;
					const limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
					const skip = (pageNum - 1) * limit;
					const exclude = req.body.exclude || [];
					const filters = {};
          const searchText = req.body.searchText || "";
          const roles = req.body.roles;
					
					if (searchText) {
            const regex = new RegExp(searchText,"gi");
						filters['$or'] = [
              { name: regex },
              { email: regex }
						];
					}		      
          
          
          if (roles && roles.length) {
            filters['roles'] = {
              $in: roles
            }
          }

					//exclude current loggedIn user as well the user sent from front-end
          exclude.push(req.user._id);           
          filters["_id"] = {
            "$nin": exclude
          };					

					User.find(filters)
            .lean()
            .select("username name email")
						.sort('name')
						.skip(skip)
						.limit(limit)
						.exec()
						.then(users => res.json({ users }))
						.catch(err => console.log(`Error: ${err}`));
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

                    //  Follwing was used in case when db has updated but token still has old values. but as for now we are not
                    //  decoding token on front-end, this is not needed.

                    // delete dbUser._id;
                    // delete req.user._id;

                    // var eq = _.isEqual(dbUser, req.user);
                    // if (!eq) {
                    //     req.refreshJWT = true;
                    // }

                    req.user = user;
                    next();
                }
            });
        },
        checkResetToken: function(req, res, next) {
            User.findOne({
              resetPasswordToken: req.params.token,
              resetPasswordExpires: {
                $gt: Date.now()
              }
            }).exec(function(err, user) {
              if (err) {
                return res.status(400).json({
                    msg: err
                });
              }
              if (!user) {
                return res.status(400).json({
                    msg: 'Please go to the reset password page and enter your email to get a new link.'
                });
              }
              return res.sendStatus(200);
            })
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
            })
            .populate('userProfile')
            .exec(function(err, user) {
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
                    let userCleansed = _.omit(user.toObject(), [
                        'salt',
                        'hashed_password'
                    ]);

                    req.redirect = req.body.hasOwnProperty('redirect')
                                    && req.body.redirect !== false
                                    && (payload.redirect = req.body.redirect);

                    MeanUser.events.emit('reset_password', {
                        action: 'reset_password',
                        user: {
                            name: user.name
                        }
                    });
                    req.logIn(userCleansed, function(err) {
                        if (err) return next(err);
                        req.user = user;
                        next();
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
                    user.resetPasswordExpires = Date.now() + 21600000; // 6 hour
                    user.save(function(err) {
                        done(err, token, user);
                    });
                },
                function(token, user, done) {
                    const template = "forgot-password";
                    const context = {
                      user,
                      token
                    };
                    const mailOptions = {
                      to: user.email,
                      from: config.emailFrom,
                      subject: 'Ideawake - changing your password'
                    };
                    sendByTemplate(template, context, mailOptions, function(err){
                      if (err) {
                        done(err);
                      }else {
                        done(null, user);
                      }
                    });                                        
                }
            ],
            function(err, user) {

                var response = {
                    message: `An email has been sent to the email address you provided below. 
                        Please check your email to reset your password.`,
                    status: 'success'
                };
                if (err) {
                    response.message = `Oops! There is no user registered with this email, 
                        please make sure that the email you entered is correct. 
                        If you continue having trouble, please 
                        <a href="${config.hostname}/contact">contact support</a>`;
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
