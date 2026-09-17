const express = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { asyncHandler } = require('../../utils');
const controller = require('./records.controller');

const router = express.Router();

// All routes are read-only and scoped to the authenticated user (role_aliases
// is the one exception — it's a global lookup table, not per-user data).
// `applications` already has its own full read/write API under /jobs.
router.get('/processed-emails', authMiddleware, asyncHandler(controller.listProcessedEmails));
router.get('/processed-emails/:id', authMiddleware, asyncHandler(controller.getProcessedEmail));

router.get('/sync-status', authMiddleware, asyncHandler(controller.getSyncStatus));

router.get('/timeline-events', authMiddleware, asyncHandler(controller.listTimelineEvents));
router.get('/timeline-events/:id', authMiddleware, asyncHandler(controller.getTimelineEvent));

router.get('/role-aliases', authMiddleware, asyncHandler(controller.listRoleAliases));

router.get('/users/me', authMiddleware, asyncHandler(controller.getSelf));

module.exports = router;
