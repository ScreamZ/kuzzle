/**
 * Tests the notify function of the Notifier core component.
 * Besides the init() function, this is the only exposed method to the world, and this is the
 * central point of communication for the whole Kuzzle project.
 */
var
  should = require('should'),
  sinon = require('sinon'),
  sandbox = sinon.sandbox.create(),
  rewire = require('rewire'),
  Kuzzle = require.main.require('lib/api/kuzzle'),
  Redis = rewire('../../../../lib/services/redis'),
  RedisClientMock = require('../../../mocks/services/redisClient.mock'),
  RequestObject = require.main.require('kuzzle-common-objects').Models.requestObject;

describe('Test: notifier.publish', () => {
  var
    dbname = 'unit-tests',
    kuzzle,
    internalCache,
    notification,
    request,
    spyInternalCacheAdd,
    spyInternalCacheExpire,
    rooms = ['foo'];

  before(() => {
    kuzzle = new Kuzzle();
    internalCache = new Redis(kuzzle, {service: dbname}, kuzzle.config.services.internalCache);
    return Redis.__with__('buildClient', () => new RedisClientMock())(() => {
      return internalCache.init();
    });
  });

  beforeEach(() => {
    sandbox.stub(kuzzle.internalEngine, 'get').resolves({});
    return kuzzle.services.init({whitelist: []})
      .then(() => {
        request = {
          controller: 'write',
          action: 'publish',
          requestId: 'foo',
          collection: 'bar',
          _id: 'I am fabulous',
          body: { youAre: 'fabulous too' },
          metadata: {}
        };
        kuzzle.services.list.internalCache = internalCache;
        spyInternalCacheAdd = sandbox.stub(kuzzle.services.list.internalCache, 'add').resolves({});
        spyInternalCacheExpire = sandbox.stub(kuzzle.services.list.internalCache, 'expire').resolves({});
        sandbox.stub(kuzzle.notifier, 'notify', (r, rq, n) => {notification = n;});

        notification = null;
      });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should publish messages', () => {
    sandbox.stub(kuzzle.dsl, 'test').resolves(rooms);
    return kuzzle.notifier.publish(new RequestObject(request))
      .then(result => {
        should(result).match({published: true});
        should(notification.state).be.eql('done');
        should(notification.scope).be.eql('in');
        should(notification._id).be.eql(request._id);
        should(notification._source).be.eql(request.body);
        should(spyInternalCacheAdd.called).be.false();
        should(spyInternalCacheExpire.called).be.false();
      });
  });

  it('should cache the document in case of a create document request', () => {
    sandbox.stub(kuzzle.dsl, 'test').resolves(rooms);

    request.action = 'create';
    return kuzzle.notifier.publish(new RequestObject(request))
      .then(() => {
        should(notification.state).be.eql('pending');
        should(notification.scope).be.undefined();
        should(notification._id).be.eql(request._id);
        should(notification._source).be.eql(request.body);
        should(spyInternalCacheAdd.calledOnce).be.true();
        should(spyInternalCacheExpire.calledOnce).be.true();
      });
  });

  it('should cache the document in case of a createOrReplace document request', () => {
    sandbox.stub(kuzzle.dsl, 'test').resolves(rooms);

    request.action = 'createOrReplace';
    return kuzzle.notifier.publish(new RequestObject(request))
      .then(() => {
        should(notification.state).be.eql('pending');
        should(notification.scope).be.undefined();
        should(notification._id).be.eql(request._id);
        should(notification._source).be.eql(request.body);
        should(spyInternalCacheAdd.calledOnce).be.true();
        should(spyInternalCacheExpire.calledOnce).be.true();
      });
  });

  it('should cache the document in case of a replace document request', () => {
    sandbox.stub(kuzzle.dsl, 'test').resolves(rooms);

    request.action = 'replace';
    return kuzzle.notifier.publish(new RequestObject(request))
      .then(() => {
        should(notification.state).be.eql('pending');
        should(notification.scope).be.undefined();
        should(notification._id).be.eql(request._id);
        should(notification._source).be.eql(request.body);
        should(spyInternalCacheAdd.calledOnce).be.true();
        should(spyInternalCacheExpire.calledOnce).be.true();
      });
  });

  it('should do nothing if there is no room to notify', () => {
    sandbox.stub(kuzzle.dsl, 'test').resolves([]);

    return kuzzle.notifier.publish(new RequestObject(request))
      .then(result => {
        should(result).match({published: true});
        should(notification).be.null();
        should(spyInternalCacheAdd.called).be.false();
        should(spyInternalCacheExpire.called).be.false();
      });
  });

  it('should return a rejected promise if dsl.test fails', () => {
    sandbox.stub(kuzzle.dsl, 'test').rejects(new Error(''));
    return should(kuzzle.notifier.publish(new RequestObject(request))).be.rejected();
  });
});
