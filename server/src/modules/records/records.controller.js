const service = require('./records.service');

const listProcessedEmails = async (req, res) => {
  const emails = await service.listProcessedEmails(req.user.id, req.query);
  res.json({ emails });
};

const getProcessedEmail = async (req, res) => {
  const email = await service.getProcessedEmail(req.params.id, req.user.id);
  res.json({ email });
};

const getSyncStatus = async (req, res) => {
  const syncStatus = await service.getSyncStatus(req.user.id);
  res.json({ syncStatus });
};

const listTimelineEvents = async (req, res) => {
  const events = await service.listTimelineEvents(req.user.id, req.query);
  res.json({ events });
};

const getTimelineEvent = async (req, res) => {
  const event = await service.getTimelineEvent(req.params.id, req.user.id);
  res.json({ event });
};

const listRoleAliases = async (req, res) => {
  const roleAliases = await service.listRoleAliases(req.query);
  res.json({ roleAliases });
};

const getSelf = async (req, res) => {
  const user = await service.getSelf(req.user.id);
  res.json({ user });
};

module.exports = {
  listProcessedEmails,
  getProcessedEmail,
  getSyncStatus,
  listTimelineEvents,
  getTimelineEvent,
  listRoleAliases,
  getSelf,
};
