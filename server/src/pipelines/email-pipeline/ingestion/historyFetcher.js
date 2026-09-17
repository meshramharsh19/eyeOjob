// ── Full message-id fetch (first sync, or fallback when historyId has expired) ──
// Was hardcoded to a single page (maxResults: 100, no pageToken loop) — a
// full sync could never return more than 100 messages no matter how many
// existed in the 30-day window. Paginates now, same pattern as
// fetchMessageIdsIncremental below. maxTotal guards against an unbounded
// first sync on a very active inbox; raise it if you need more than 500 in
// one pass.
const fetchMessageIdsFull = async (gmail, { maxTotal = 100 } = {}) => {
  const messageIds = [];
  let pageToken;

  do {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: Math.min(100, maxTotal - messageIds.length), // Gmail caps each page at 100 regardless
      q: 'in:inbox newer_than:30d', // last 30 days
      pageToken,
    });
    messageIds.push(...(listRes.data.messages || []).map(m => m.id));
    pageToken = listRes.data.nextPageToken;
  } while (pageToken && messageIds.length < maxTotal);

  return messageIds;
};

// ── Incremental fetch via Gmail history.list — only messages added since startHistoryId ──
// Returns null (instead of throwing) when Gmail reports the historyId is too old (404),
// which happens once mailbox history has been purged (~7 days) — caller should fall back to full fetch.
const fetchMessageIdsIncremental = async (gmail, startHistoryId) => {
  const messageIds = new Set();
  let pageToken;

  try {
    do {
      const res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        pageToken,
      });

      (res.data.history || []).forEach(h => {
        (h.messagesAdded || []).forEach(m => {
          if (m.message.labelIds?.includes('INBOX')) messageIds.add(m.message.id);
        });
      });

      pageToken = res.data.nextPageToken;
    } while (pageToken);

    return Array.from(messageIds);
  } catch (err) {
    if (err.code === 404) return null; // historyId expired — caller falls back to full sync
    throw err;
  }
};

module.exports = { fetchMessageIdsFull, fetchMessageIdsIncremental };
