const env = require('./env');
const database = require('./database');
const passport = require('./passport');
const logger = require('./logger');
const mailer = require('./mailer');

module.exports = { env, database, passport, logger, mailer };
