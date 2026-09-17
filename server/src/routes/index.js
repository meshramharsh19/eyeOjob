const express = require('express');
const { routes: authRoutes } = require('../modules/auth');
const { routes: applicationRoutes } = require('../modules/applications');
const { routes: recordsRoutes } = require('../modules/records');
const { routes: notificationRoutes } = require('../modules/notifications');
const { routes: gmailRoutes } = require('../pipelines/email-pipeline');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/gmail', gmailRoutes);
router.use('/jobs', applicationRoutes);
router.use('/records', recordsRoutes);
router.use('/notifications', notificationRoutes);

module.exports = router;
