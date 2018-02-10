'use strict';

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
  Schema = mongoose.Schema;
var mongoose_delete = require('mongoose-delete');


/**
 * PredictionMarket Schema
 */
var UserProfileSchema = new Schema({
  created: {
    type: Date,
    default: Date.now
  },
  displayName: {
    type: String,
    required: false,
    trim: true
  },
  description: {
    type: String,
    required: false,
    trim: true
  },
  user: {
    type: Schema.ObjectId,
    ref: 'User'
  },
  permissions: {
    type: Array
  },
  updated: {
    type: Array
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  status: String,
  location: {
    type: String,
    required: false,
    trim: true
  },
  points: {
    type: Number,
    default: 0
  },
  pointsLog: { // gamification logging
    type: Array
  },
  profileImage: {
    'uploadType' : String,
    'path' : String,
    'url' : String,
    'fileName': String,
    'fileSize': Number,
    'fileType': String
  },
  mailSettings: {
    'sendEmails' : {
      type: Boolean,
      default: true
    },
    'invitedToChallenge': {
      type: Boolean,
      default: true
    },
    'adminWeeklyEmails': {
      type: Boolean,
      default: true
    },
    'ideaDailyEmails': {
      type: Boolean,
      default: true
    },
    'commentReplyEmails': {
      type: Boolean,
      default: true
    }
  },
  deleted: {
    type: Boolean,
    default: false
  },
  defaultLanguage:{
    type: String,
    default: 'en-US'
  },
  demographics: {
    educationLevel: String,
    majorEducation: String,
    currentYears: String,
    totalYears: String,
    cityAndState: String,
    currentTitle: String,
    isManager: Boolean,
    totalSubordinates: Number,
    directSupervisorTitle: String
  }
});


UserProfileSchema.methods.updateDemographicsAndLanguage =
  function(demographics, language) {
    this.demographics = Object.assign(this.demographics, demographics);
    if (language) {
      this.defaultLanguage = language;
    }

    return this.save();
  };


/**
 * Validations
 */
UserProfileSchema.path('displayName').validate(function(displayName) {
  return !!displayName;
}, 'Display Name cannot be blank');

// UserProfileSchema.path('description').validate(function(description) {
//   return !!description;
// }, 'description cannot be blank');

/**
 * Statics
 */
UserProfileSchema.statics.load = function(id, cb) {
  this.findOne({
    _id: id
  }).populate('user', 'name username').exec(cb);
};

UserProfileSchema.plugin(mongoose_delete);

mongoose.model('UserProfile', UserProfileSchema);
