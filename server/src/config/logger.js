const levels = ['error', 'warn', 'info', 'debug'];

const format = (level, args) => {
  const timestamp = new Date().toISOString();
  return [`[${timestamp}] [${level.toUpperCase()}]`, ...args];
};

const logger = levels.reduce((acc, level) => {
  const consoleMethod = level === 'debug' ? 'log' : level;
  acc[level] = (...args) => console[consoleMethod](...format(level, args));
  return acc;
}, {});

module.exports = logger;
