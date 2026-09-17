const express = require('express');
const authMiddleware = require('../../../middlewares/auth.middleware');
const { asyncHandler } = require('../../../utils');
const controller = require('./connection.controller');

const router = express.Router();

router.get('/connect', authMiddleware, controller.connect);
router.get('/callback', asyncHandler(controller.callback));
router.get('/status', authMiddleware, asyncHandler(controller.status));

module.exports = router;
