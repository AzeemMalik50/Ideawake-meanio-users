const mongoose = require('mongoose');
const crypto = require('crypto');
const config = require('meanio').getConfig();

var mailer;

// Temporary work-around for circular dependency
setTimeout(() => mailer = require('../../../../services/mailer')(), 2000);

module.exports = {
  /**
   * HasRole - check if the user has required role
   *
   * @param {String} plainText
   * @return {Boolean}
   * @api public
   */
  hasRole: function (role) {
    var roles = this.roles;
    return roles.indexOf('admin') !== -1 || roles.indexOf(role) !== -1;
  },

  /**
   * IsAdmin - check if the user is an administrator
   *
   * @return {Boolean}
   * @api public
   */
  isAdmin: function () {
    return this.roles.indexOf('admin') !== -1;
  },

  /**
   * Authenticate - check if the passwords are the same
   *
   * @param {String} plainText
   * @return {Boolean}
   * @api public
   */
  authenticate: function (plainText) {
    return this.hashPassword(plainText) === this.hashed_password;
  },

  /**
 * Make salt
 *
 * @return {String}
 * @api public
 */
  makeSalt: function () {
    return crypto.randomBytes(16).toString('base64');
  },

  /**
   * Hash password
   *
   * @param {String} password
   * @return {String}
   * @api public
   */
  hashPassword: function (password) {
    if (!password || !this.salt) return '';
    var salt = new Buffer(this.salt, 'base64');
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('base64');
  },

  /**
   * Hide security sensitive fields
   *
   * @returns {*|Array|Binary|Object}
   */
  toJSON: function () {
    var obj = this.toObject();
    delete obj.hashed_password;
    delete obj.salt;
    return obj;
  },

  sendWelcomeEmail: function () {
    const template = "welcome-email";
    const context = {
      user: { name: this.name },
      hostname: config.hostname
    };
    const mailOptions = {
      to: this.secondaryEmail || this.email,
      from: config.emailFrom,
      subject: 'Welcome to Ideawake'
    };
    mailer.sendTemplateDb(template, context, mailOptions, function (err) {
      if (err)
        console.log(`Error in sending welcome email: ${err.toString()}`);
    });
  }
};
