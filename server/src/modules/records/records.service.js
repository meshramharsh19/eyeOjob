const { NotFoundError } = require('../../errors');
const repository = require('./records.repository');

const listProcessedEmails = (userId, query) => repository.findProcessedEmails(userId, query);

const getProcessedEmail = async (id, userId) => {
  const email = await repository.findProcessedEmailById(id, userId);
  if (!email) throw new NotFoundError('Not found');
  return email;
};

const getSyncStatus = async (userId) => {
  const status = await repository.findSyncStatus(userId);
  if (!status) throw new NotFoundError('Not found');
  return status;
};

const listTimelineEvents = (userId, query) => repository.findTimelineEvents(userId, query);

const getTimelineEvent = async (id, userId) => {
  const event = await repository.findTimelineEventById(id, userId);
  if (!event) throw new NotFoundError('Not found');
  return event;
};

const listRoleAliases = (query) => repository.findRoleAliases(query);

const getSelf = async (userId) => {
  const user = await repository.findSelf(userId);
  if (!user) throw new NotFoundError('Not found');
  return user;
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
