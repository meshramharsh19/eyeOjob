const express = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { asyncHandler } = require('../../utils');
const controller = require('./applications.controller');

const router = express.Router();

router.post('/sync', authMiddleware, asyncHandler(controller.sync));
router.post('/sync/stop', authMiddleware, asyncHandler(controller.stopSync));
router.get('/', authMiddleware, asyncHandler(controller.list));
router.post('/', authMiddleware, asyncHandler(controller.create));
router.get('/meta/stats', authMiddleware, asyncHandler(controller.stats));
router.get('/:id', authMiddleware, asyncHandler(controller.getOne));
router.patch('/:id', authMiddleware, asyncHandler(controller.update));
router.put('/:id', authMiddleware, asyncHandler(controller.update));
router.delete('/:id', authMiddleware, asyncHandler(controller.remove));
router.patch('/:id/status', authMiddleware, asyncHandler(controller.updateStatus));
router.post('/:id/milestones', authMiddleware, asyncHandler(controller.addMilestone));
router.patch('/:id/timeline/:eventId/dismiss', authMiddleware, asyncHandler(controller.dismissEvent));

module.exports = router;
