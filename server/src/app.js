const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const passport = require('./config/passport');
require('./config/database');

const requestLogger = require('./middlewares/requestLogger.middleware');
const notFound = require('./middlewares/notFound.middleware');
const errorHandler = require('./middlewares/errorHandler.middleware');
const routes = require('./routes');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);
app.use(passport.initialize());

app.use('/', routes);

app.get('/', (req, res) => res.json({ message: 'JobTracker API 🚀' }));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
