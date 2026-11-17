const state = require('./utils/state');
App({ onShow() { state.flushEvents(); } });
