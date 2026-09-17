const service = require('./notifications.service');

const list = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const notifications = await service.listForUser(req.user.id, { limit, offset });
  res.json({ notifications });
};

const unreadCount = async (req, res) => {
  const count = await service.getUnreadCount(req.user.id);
  res.json({ count });
};

const markRead = async (req, res) => {
  await service.markRead(req.params.id, req.user.id);
  res.json({ message: 'Notification marked as read' });
};

const markAllRead = async (req, res) => {
  await service.markAllRead(req.user.id);
  res.json({ message: 'All notifications marked as read' });
};

module.exports = { list, unreadCount, markRead, markAllRead };
