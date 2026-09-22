const service = require('./ai-providers.service');

const catalog = async (req, res) => {
  res.json(service.getCatalog());
};

const connected = async (req, res) => {
  const providers = await service.listConnected(req.user.id);
  res.json(providers);
};

const setupInfo = async (req, res) => {
  res.json(service.getSetupInfo(req.params.provider));
};

const validate = async (req, res) => {
  const { apiKey, model } = req.body;
  const result = await service.validateCredential(req.params.provider, apiKey, model);
  res.json(result);
};

const connectProvider = async (req, res) => {
  const { apiKey, model } = req.body;
  const provider = await service.connect(req.user.id, req.params.provider, apiKey, model);
  res.json({ success: true, provider });
};

const updateModel = async (req, res) => {
  const provider = await service.updateModel(req.user.id, req.params.id, req.body.model);
  res.json({ success: true, provider });
};

const testStored = async (req, res) => {
  const result = await service.testStored(req.user.id, req.params.id);
  res.json(result);
};

const setPriorities = async (req, res) => {
  const order = await service.setPriorities(req.user.id, req.body.providerIds);
  res.json({ success: true, order });
};

const disconnect = async (req, res) => {
  await service.disconnect(req.user.id, req.params.id);
  res.json({ success: true });
};

const monthlyUsage = async (req, res) => {
  res.json(await service.getMonthlyUsage(req.user.id));
};

const usageSummary = async (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 30, 365);
  res.json(await service.getUsageSummary(req.user.id, days));
};

module.exports = {
  catalog, connected, setupInfo, validate, connectProvider,
  updateModel, testStored, setPriorities, disconnect, monthlyUsage, usageSummary,
};
