const applicationsService = require('./applications.service');

const sync = async (req, res) => {
  const result = await applicationsService.triggerSync(req.user.id);
  const message = result.stopped ? 'Sync stopped' : 'Sync complete';
  res.json({ message, ...result });
};

const stopSync = async (req, res) => {
  await applicationsService.stopSync(req.user.id);
  res.json({ message: 'Stop requested — sync will halt shortly.' });
};

const list = async (req, res) => {
  const applications = await applicationsService.listForUser(req.user.id);
  res.json({ applications });
};

const getOne = async (req, res) => {
  const result = await applicationsService.getWithTimeline(req.params.id, req.user.id);
  res.json(result);
};

const create = async (req, res) => {
  const application = await applicationsService.createManualApplication(req.user.id, req.body);
  res.status(201).json({ message: 'Application created successfully', application });
};

const update = async (req, res) => {
  const application = await applicationsService.updateManualApplication(req.params.id, req.user.id, req.body);
  res.json({ message: 'Application updated successfully', application });
};

const remove = async (req, res) => {
  const result = await applicationsService.deleteApplication(req.params.id, req.user.id, req.body);
  res.json(result);
};

const updateStatus = async (req, res) => {
  const application = await applicationsService.updateStatus(req.params.id, req.user.id, req.body);
  res.json({ message: 'Status updated', application });
};

const stats = async (req, res) => {
  const result = await applicationsService.getStats(req.user.id);
  res.json(result);
};

const dismissEvent = async (req, res) => {
  const result = await applicationsService.dismissEvent(req.params.id, req.params.eventId, req.user.id);
  res.json(result);
};

const addMilestone = async (req, res) => {
  const result = await applicationsService.addMilestone(req.params.id, req.user.id, req.body);
  res.status(201).json(result);
};

module.exports = {
  sync,
  stopSync,
  list,
  getOne,
  create,
  update,
  remove,
  updateStatus,
  stats,
  dismissEvent,
  addMilestone,
};
