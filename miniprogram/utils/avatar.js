const config = require('../config/avatars');
const clean = value => typeof value === 'string' ? value.trim() : '';
function forAge(age) { return clean(config.byAge?.[age]) || clean(config.defaultAvatar); }
module.exports = { forAge };
