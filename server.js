const config = require('./config');
const Uuid = require('node-uuid')
const ConferenceService = require('./lib/ConferenceService');
const MediaEngine = require('./lib/MediaEngine');
const MessageBus = require('./lib/MessageBus');
const SipService = require('./lib/SipService');
const conferences = config.conferences;

const mediaEngine = new MediaEngine(config);
mediaEngine.start();

const conferenceService = new ConferenceService(config, mediaEngine);
conferenceService.start();

const messageBus = new MessageBus(config.messageBus);
messageBus.start();

const sipService = new SipService({ messageBus: config.messageBus, conferences: conferences }, conferenceService);
sipService.start();

process.on('SIGINT', function() {
  conferenceService.stop();
  sipService.stop();
  messageBus.stop();
  setTimeout(function() { process.exit(0); }, 1000);
});
