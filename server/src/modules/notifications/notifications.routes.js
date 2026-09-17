const express = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { asyncHandler } = require('../../utils');
const controller = require('./notifications.controller');

const router = express.Router();

router.get('/', authMiddleware, asyncHandler(controller.list));
router.get('/unread-count', authMiddleware, asyncHandler(controller.unreadCount));
router.patch('/read-all', authMiddleware, asyncHandler(controller.markAllRead));
router.patch('/:id/read', authMiddleware, asyncHandler(controller.markRead));

module.exports = router;
