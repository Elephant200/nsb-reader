const configuredBans = (process.env.BANNED_IPS ?? '')
  .split(',')
  .map(ip => ip.trim())
  .filter(Boolean);

export const clientIp = (req, _res) => {
  return req.headers['x-forwarded-for'] ? (req.headers['x-forwarded-for']).split(',')[0] : req.ip;
};

export function isBannedIp (ip) {
  return configuredBans.includes(ip);
}

export const ipFilterMiddleware = (req, res, next) => {
  const ip = clientIp(req);
  if (isBannedIp(ip)) {
    const message = 'Your IP address has been blocked. If you believe this is an error, contact a developer.';
    return res.status(403).send(message).end();
  }
  next();
};
