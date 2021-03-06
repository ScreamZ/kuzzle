var
  should = require('should'),
  rewire = require('rewire'),
  sinon = require('sinon'),
  DslFilters = rewire('../../../../lib/api/dsl/filters');

describe('Test: dsl.testFilterRecursively', () => {
  var
    testFilterRecursively = DslFilters.__get__('testFilterRecursively');

  it('should return the result of the filter if no upper operand is provided', () => {
    var
      filter1 = {
        foo: {
          args: {
            operator: 'equals',
            not: true,
            field: 'foo',
            value: 'bar'
          }
        }
      },
      filter2 = {
        foo: {
          args: {
            operator: 'equals',
            not: false,
            field: 'foo',
            value: 'bar'
          }
        }
      };

    should(testFilterRecursively({}, filter1, {})).be.true();
    should(testFilterRecursively({}, filter2, {})).be.false();
  });

  it('should do nothing if a wrong upper operand argument is provided', () => {
    var
      filter1 = {
        foo: {
          args: {
            operator: 'equals',
            not: true,
            field: 'foo.bar',
            value: 'bar'
          }
        }
      },
      filter2 = {
        foo: {
          args: {
            operator: 'equals',
            not: false,
            field: 'foo.bar',
            value: 'bar'
          }
        }
      };

    should(testFilterRecursively({}, filter1, {}, 'foo')).be.undefined();
    should(testFilterRecursively({}, filter2, {}, 'foo')).be.undefined();
  });

  it('should return the final result of an AND filter set', () => {
    var
      stub = sinon.stub(),
      filters = {
        foo: {
          args: {operator: 'equals', not: true, field: 'foo.bar', value: 'bar'}
        },
        bar: {
          args: {operator: 'equals', not: true, field: 'foo.bar', value: 'bar'}
        },
        baz: {
          args: {operator: 'equals', not: true, field: 'foo.bar', value: 'bar'}
        }
      };

    stub.onFirstCall().returns(true);
    stub.onSecondCall().returns(true);
    stub.onThirdCall().returns(true);

    DslFilters.__with__({
      evalFilterArguments: stub
    })(() => {
      testFilterRecursively({}, filters, {}, 'and');
      should(stub.callCount).be.eql(3);
      stub.reset();

      stub.onSecondCall().returns(false);
      testFilterRecursively({}, filters, {}, 'and');
      should(stub.callCount).be.eql(2);
    });
  });

  it('should return the final result of an OR filter set', () => {
    var
      stub = sinon.stub(),
      filters = {
        foo: {
          args: {operator: 'equals', not: true, field: 'foo.bar', value: 'bar'}
        },
        bar: {
          args: {operator: 'equals', not: true, field: 'foo.bar', value: 'bar'}
        },
        baz: {
          args: {operator: 'equals', not: true, field: 'foo.bar', value: 'bar'}
        }
      };

    stub.onFirstCall().returns(true);
    stub.onSecondCall().returns(true);
    stub.onThirdCall().returns(true);

    DslFilters.__with__({
      evalFilterArguments: stub
    })(() => {
      testFilterRecursively({}, filters, {}, 'or');
      should(stub.callCount).be.eql(1);
      stub.reset();

      stub.onFirstCall().returns(false);
      stub.onSecondCall().returns(false);
      testFilterRecursively({}, filters, {}, 'or');
      should(stub.callCount).be.eql(3);
    });
  });
});
