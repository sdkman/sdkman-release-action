const nock = require("nock");

// No test may reach the network: every HTTP call must be intercepted by nock.
nock.disableNetConnect();

afterEach(() => {
  nock.cleanAll();
});
