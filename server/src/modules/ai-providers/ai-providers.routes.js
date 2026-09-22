const express = require('express');
const authMiddleware = require('../../middlewares/auth.middleware');
const { aiProviderConnectLimiter, aiProviderValidateLimiter } = require('../../middlewares/rateLimiter.middleware');
const { asyncHandler } = require('../../utils');
const controller = require('./ai-providers.controller');

const router = express.Router();

// Static/catalog routes before the ':provider'/':id' dynamic ones so
// 'priorities' and 'usage' never get swallowed as a provider/id param.
//
// /validate, /connect, and /:id/test each trigger a live call to an
// external provider API — rate-limited independently of the general auth
// limiters (Section 11 threat model, Project DOCs/BYOK.md) so probing or
// retry-looping one of these can't be used to hammer a provider's API
// through our server, or to brute-force-guess a valid key.
router.get('/providers', authMiddleware, asyncHandler(controller.catalog));
router.get('/providers/connected', authMiddleware, asyncHandler(controller.connected));
router.put('/providers/priorities', authMiddleware, asyncHandler(controller.setPriorities));
router.get('/providers/:provider/setup', authMiddleware, asyncHandler(controller.setupInfo));
router.post('/providers/:provider/validate', authMiddleware, aiProviderValidateLimiter, asyncHandler(controller.validate));
router.post('/providers/:provider/connect', authMiddleware, aiProviderConnectLimiter, asyncHandler(controller.connectProvider));
router.patch('/providers/:id', authMiddleware, asyncHandler(controller.updateModel));
router.post('/providers/:id/test', authMiddleware, aiProviderValidateLimiter, asyncHandler(controller.testStored));
router.delete('/providers/:id', authMiddleware, asyncHandler(controller.disconnect));

router.get('/usage/monthly', authMiddleware, asyncHandler(controller.monthlyUsage));
router.get('/usage', authMiddleware, asyncHandler(controller.usageSummary));

module.exports = router;
