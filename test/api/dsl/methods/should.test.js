var
  should = require('should'),
  rewire = require('rewire'),
  sinon = require('sinon'),
  Promise = require('bluebird'),
  Methods = rewire('../../../../lib/api/dsl/methods');

describe('Test: dsl.should method', () => {
  var
    methods,
    sandbox;

  before(() => {
    should.noConflict();

    Methods.__set__('getFormattedFilters', sinon.stub().returns(Promise.resolve()));
    methods = new Methods({filtersTree: {}});
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => sandbox.restore());

  it('should call the function "OR" in case of a should filter', () => {
    sandbox.stub(methods, 'or');
    methods.should('roomId', 'index', {}, {}, false);
    should(methods.or.called).be.true();
    should(methods.or.calledWith('roomId', 'index', {}, {}, false)).be.true();
  });
});
