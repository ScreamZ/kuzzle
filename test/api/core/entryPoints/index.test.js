/**
 * This component initializes
 */
var
  should = require('should'),
  Kuzzle = require.main.require('lib/api/Kuzzle'),
  sandbox = require('sinon').sandbox.create(),
  EntryPoints = require.main.require('lib/api/core/entryPoints'),
  Lb = require.main.require('lib/api/core/entryPoints/lb'),
  Mq = require.main.require('lib/api/core/entryPoints/mq'),
  Http = require.main.require('lib/api/core/entryPoints/http');

describe('Test: core/entryPoints', function () {

  var httpPort = 6667;

  afterEach(() => {
    sandbox.restore();
  });

  it('should create instance of lb/mq/http server on creation', function () {
    var
      kuzzle = new Kuzzle(),
      entryPoints = new EntryPoints(kuzzle, {httpPort: httpPort});

    should(entryPoints).be.an.Object();
    should(entryPoints.lb).be.instanceOf(Lb);
    should(entryPoints.mq).be.instanceOf(Mq);
    should(entryPoints.http).be.instanceOf(Http);
  });

  it('should call init of each entry points', function () {
    var
      kuzzle = new Kuzzle(),
      entryPoints = new EntryPoints(kuzzle, {httpPort: httpPort}),
      spyLb = sandbox.stub(entryPoints.lb, 'init'),
      spyMq = sandbox.stub(entryPoints.mq, 'init'),
      spyHttp = sandbox.stub(entryPoints.http, 'init');


    entryPoints.init();

    should(spyLb.callCount).be.eql(1);
    should(spyMq.callCount).be.eql(1);
    should(spyHttp.callCount).be.eql(1);
  });
});
