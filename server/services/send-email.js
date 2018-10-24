const mongoose = require('mongoose');
const config = require('meanio').getConfig();
const EmailTemplate = require('email-templates').EmailTemplate;
const path = require('path');
const _ = require('lodash');
const nodemailer = require('nodemailer');
const mandrillTransport = require('nodemailer-mandrill-transport');


/**
* Send reset password email
*/
function sendMail(mailOptions, cb) {
  var transport = nodemailer.createTransport(mandrillTransport(config.mailer));
  transport.sendMail(mailOptions, function (err, response) {
    if (err) {
      cb(err);
    } else {
      cb(null, response);
    }
  });
}

module.exports = {
  sendByTemplate: function (template, contextOptions, mailOptions, cb) {
    let emailLogoUrl = 'https://gallery.mailchimp.com/a4ba02972580aa81f393d12ad/images/cc42f469-c38a-44b6-934f-855ba91adb98.png';
    const PlatformSettings = mongoose.model('PlatformSetting');
    PlatformSettings.findOne({}, function (err, settings) {
      if (err) cb(err);
      emailLogoUrl = settings.emailLogo && settings.emailLogo.url
        ? settings.emailLogo.url : emailLogoUrl;
      emailLogoUrl = encodeURI(emailLogoUrl);
      const defaultContextOptions = {
        hostname: config.hostname || process.env.HOST_NAME,
        companyName: process.env.COMPANY_NAME,
        nl2br: function (str) { return str.replace(/\r|\n|\r\n/g, '<br />') },
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
        function (err, result) {
          if (err) {
            console.log(`>>>> ======================= EmailTemplates error ======================= >>>>`, template, err);
            cb('Error processing email template');
            // return;
          } else {
            const options = _.merge(defaultMailOptions, {
              html: result.html,
              text: result.text
            });
            sendMail(options, function (err, response) {
              if (err) console.log('Error in Sending Reset Password Email', err);
            });
            cb();
          }
        }
      );
    });
  },
};