




const dns = require('dns')

const SERVERS = (
  process.env.NODE_DNS_SERVERS || '8.8.8.8,1.1.1.1,8.8.4.4'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

dns.setServers(SERVERS)
