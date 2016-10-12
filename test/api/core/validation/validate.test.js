var
  should = require('should'),
  sinon = require('sinon'),
  rewire = require('rewire'),
  Validation = rewire('../../../../lib/api/core/validation'),
  KuzzleMock = require('../../../mocks/kuzzle.mock');

describe('Test: validation.validate', () => {
  var
    validation,
    sandbox = sinon.sandbox.create(),
    addErrorMessage = Validation.__get__('addErrorMessage'),
    checkAllowedProperties = Validation.__get__('checkAllowedProperties'),
    kuzzle,
    indexName = 'anIndex',
    collectionName = 'aCollection';

  beforeEach(() => {
    kuzzle = new KuzzleMock();
    validation = new Validation(kuzzle);
    sandbox.reset();
    Validation.__set__('addErrorMessage', addErrorMessage);
    Validation.__set__('checkAllowedProperties', checkAllowedProperties);
  });

  describe('#validate', () => {
    it('should return the modified requestObject if everything is valid and use _id if action is an update', () => {
      var
        validationPromiseStub = sandbox.spy(function () {
          return Promise.resolve({
            validation: true,
            errorMessages: [],
            documentBody: arguments[5]
          });
        }),
        controllerName = 'write',
        actionName = 'update',
        id = 'anId',
        requestObject = {
          index: indexName,
          collection: collectionName,
          controller: controllerName,
          action: actionName,
          data: {
            _id: id,
            body: {
              some: 'content'
            }
          }
        };

      validation.validationPromise = validationPromiseStub;

      return validation.validate(requestObject)
        .then(result => {
          should(result).be.deepEqual(requestObject);
          should(validationPromiseStub.callCount).be.eql(1);
          should(validationPromiseStub.args[0][0]).be.eql(indexName);
          should(validationPromiseStub.args[0][1]).be.eql(collectionName);
          should(validationPromiseStub.args[0][2]).be.eql(controllerName);
          should(validationPromiseStub.args[0][3]).be.eql(actionName);
          should(validationPromiseStub.args[0][4]).be.eql(id);
          should(validationPromiseStub.args[0][5]).be.deepEqual(requestObject.data.body);
          should(validationPromiseStub.args[0][6]).be.false();
        });
    });

    it('should return the modified requestObject if everything is valid', () => {
      var
        validationPromiseStub = sandbox.spy(function () {
          return Promise.resolve({
            validation: true,
            errorMessages: [],
            documentBody: arguments[5]
          });
        }),
        controllerName = 'aController',
        actionName = 'anAction',
        requestObject = {
          index: indexName,
          collection: collectionName,
          controller: controllerName,
          action: actionName,
          data: {
            body: {
              some: 'content'
            }
          }
        };

      validation.validationPromise = validationPromiseStub;

      return validation.validate(requestObject)
        .then(result => {
          should(result).be.deepEqual(requestObject);
          should(validationPromiseStub.callCount).be.eql(1);
          should(validationPromiseStub.args[0][0]).be.eql(indexName);
          should(validationPromiseStub.args[0][1]).be.eql(collectionName);
          should(validationPromiseStub.args[0][2]).be.eql(controllerName);
          should(validationPromiseStub.args[0][3]).be.eql(actionName);
          should(typeof validationPromiseStub.args[0][4]).be.eql('undefined');
          should(validationPromiseStub.args[0][5]).be.deepEqual(requestObject.data.body);
          should(validationPromiseStub.args[0][6]).be.false();
        });
    });

    it('should throw an error if the validation returns false', () => {
      var
        controllerName = 'aController',
        actionName = 'anAction',
        requestObject = {
          index: indexName,
          collection: collectionName,
          controller: controllerName,
          action: actionName,
          data: {
            body: {
              some: 'content'
            }
          }
        };

      validation.validationPromise = sandbox.spy(function () {
        return Promise.resolve({
          validation: false,
          errorMessages: ['anError'],
          documentBody: null
        });
      });

      return validation.validate(requestObject)
        .should.rejectedWith('anError');
    });

    it('should throw an error if the requestObject has no data property', () => {
      var
        controllerName = 'aController',
        actionName = 'anAction',
        requestObject = {
          index: indexName,
          collection: collectionName,
          controller: controllerName,
          action: actionName
        };

      (() => {
        validation.validate(requestObject);
      }).should.throw('The request object must provide data');
    });

    it('should throw an error if the data has no body property', () => {
      var
        controllerName = 'aController',
        actionName = 'anAction',
        requestObject = {
          index: indexName,
          collection: collectionName,
          controller: controllerName,
          action: actionName,
          data: {}
        };

      (() => {
        validation.validate(requestObject);
      }).should.throw('The request object must provide a document body');
    });

    it('should throw an error if request is an update and _id is not provided', () => {
      var
        controllerName = 'write',
        actionName = 'update',
        requestObject = {
          index: indexName,
          collection: collectionName,
          controller: controllerName,
          action: actionName,
          data: {
            body: {
              some: 'content'
            }
          }
        };

      (() => {
        validation.validate(requestObject);
      }).should.throw('Update request must provide an _id.');
    });
  });

  describe('#validationPromise', () => {
    it('should return a validation if the specification is empty', () => {
      var
        recurseFieldValidationStub = sandbox.stub().returns(true),
        controllerName = 'aController',
        actionName = 'anAction',
        id = null,
        structuredError = false,
        documentBody = {},
        specification = {
          [indexName]: {
            [collectionName]: {
              strict: false,
              fields: {},
              validators: null
            }
          }
        };

      validation.specification = specification;

      validation.recurseFieldValidation = recurseFieldValidationStub;

      return validation.validationPromise(indexName, collectionName, controllerName, actionName, id, documentBody, structuredError)
        .then((result) => {
          should(result).be.deepEqual({
            documentBody,
            errorMessages: [],
            validation: true
          });
          should(recurseFieldValidationStub.callCount).be.eql(1);
          should(recurseFieldValidationStub.args[0][0]).be.eql(documentBody);
          should(recurseFieldValidationStub.args[0][1]).be.eql(null);
          should(typeof recurseFieldValidationStub.args[0][2]).be.eql('undefined');
          should(recurseFieldValidationStub.args[0][3]).be.false();
          should(recurseFieldValidationStub.args[0][4]).be.eql([]);
          should(recurseFieldValidationStub.args[0][5]).be.eql(structuredError);
        });
    });
    it('should return a validation if there is no specification', () => {
      var
        recurseFieldValidationStub = sandbox.stub().returns(true),
        controllerName = 'aController',
        actionName = 'anAction',
        id = null,
        structuredError = false,
        documentBody = {};

      validation.specification = {};

      validation.recurseFieldValidation = recurseFieldValidationStub;

      return validation.validationPromise(indexName, collectionName, controllerName, actionName, id, documentBody, structuredError)
        .then((result) => {
          should(result).be.deepEqual({
            documentBody,
            errorMessages: [],
            validation: true
          });
          should(recurseFieldValidationStub.callCount).be.eql(0);
        });
    });

    it('should return a validation if the specification is empty', () => {
      var
        recurseFieldValidationStub = sandbox.stub().returns(true),
        controllerName = 'aController',
        actionName = 'anAction',
        id = null,
        structuredError = true,
        documentBody = {},
        specification = {
          [indexName]: {
            [collectionName]: {
              strict: false,
              fields: {},
              validators: null
            }
          }
        };

      validation.specification = specification;

      validation.recurseFieldValidation = recurseFieldValidationStub;

      return validation.validationPromise(indexName, collectionName, controllerName, actionName, id, documentBody, structuredError)
        .then((result) => {
          should(result).be.deepEqual({
            documentBody,
            errorMessages: {},
            validation: true
          });
          should(recurseFieldValidationStub.callCount).be.eql(1);
          should(recurseFieldValidationStub.args[0][0]).be.eql(documentBody);
          should(recurseFieldValidationStub.args[0][1]).be.eql(null);
          should(typeof recurseFieldValidationStub.args[0][2]).be.eql('undefined');
          should(recurseFieldValidationStub.args[0][3]).be.false();
          should(recurseFieldValidationStub.args[0][4]).be.eql({});
          should(recurseFieldValidationStub.args[0][5]).be.eql(structuredError);
        });
    });

    it('should trigger all validation if specification enables them', () => {
      var
        recurseFieldValidationStub = sandbox.stub().returns(true),
        controllerName = 'aController',
        actionName = 'anAction',
        filterId = 'someFilter',
        testStub = sandbox.stub().resolves([filterId, 'anotherFilter']),
        dsl = {
          test: testStub
        },
        id = 'anId',
        structuredError = false,
        documentBody = {},
        specification = {
          [indexName]: {
            [collectionName]: {
              strict: true,
              fields: {
                children: {
                  aField: 'validation'
                }
              },
              validators: filterId
            }
          }
        };

      validation.specification = specification;
      validation.recurseFieldValidation = recurseFieldValidationStub;
      validation.dsl = dsl;

      return validation.validationPromise(indexName, collectionName, controllerName, actionName, id, documentBody, structuredError)
        .then((result) => {
          should(result).be.deepEqual({
            documentBody,
            errorMessages: [],
            validation: true
          });
          should(recurseFieldValidationStub.callCount).be.eql(1);
          should(recurseFieldValidationStub.args[0][0]).be.deepEqual(documentBody);
          should(recurseFieldValidationStub.args[0][1]).be.eql(null);
          should(recurseFieldValidationStub.args[0][2]).be.eql(specification[indexName][collectionName].fields.children);
          should(recurseFieldValidationStub.args[0][3]).be.true();
          should(recurseFieldValidationStub.args[0][4]).be.eql([]);
          should(recurseFieldValidationStub.args[0][5]).be.eql(structuredError);
          should(testStub.callCount).be.eql(1);
          should(testStub.args[0][0]).be.deepEqual(indexName);
          should(testStub.args[0][1]).be.deepEqual(collectionName);
          should(testStub.args[0][2]).be.deepEqual(documentBody);
          should(testStub.args[0][3]).be.deepEqual(id);
        });
    });

    it('should return an unvalid status when field validation fails', () => {
      var
        recurseFieldValidationStub = sandbox.stub().returns(false),
        controllerName = 'aController',
        actionName = 'anAction',
        filterId = 'someFilter',
        testStub = sandbox.stub().resolves([filterId, 'anotherFilter']),
        dsl = {
          test: testStub
        },
        id = 'anId',
        structuredError = false,
        documentBody = {},
        specification = {
          [indexName]: {
            [collectionName]: {
              strict: true,
              fields: {
                children: {
                  aField: 'validation'
                }
              },
              validators: filterId
            }
          }
        };

      validation.specification = specification;
      validation.recurseFieldValidation = recurseFieldValidationStub;
      validation.dsl = dsl;
      Validation.__set__('addErrorMessage', sandbox.spy(function() {arguments[1].push(arguments[2]);}));

      return validation.validationPromise(indexName, collectionName, controllerName, actionName, id, documentBody, structuredError)
        .then((result) => {
          should(result).be.deepEqual({
            documentBody,
            errorMessages: ['The document is not valid due to field validation.'],
            validation: false
          });
          should(recurseFieldValidationStub.callCount).be.eql(1);
          should(recurseFieldValidationStub.args[0][0]).be.deepEqual(documentBody);
          should(recurseFieldValidationStub.args[0][1]).be.eql(null);
          should(recurseFieldValidationStub.args[0][2]).be.eql(specification[indexName][collectionName].fields.children);
          should(recurseFieldValidationStub.args[0][3]).be.true();
          should(recurseFieldValidationStub.args[0][5]).be.eql(structuredError);
          should(testStub.callCount).be.eql(1);
          should(testStub.args[0][0]).be.deepEqual(indexName);
          should(testStub.args[0][1]).be.deepEqual(collectionName);
          should(testStub.args[0][2]).be.deepEqual(documentBody);
          should(testStub.args[0][3]).be.deepEqual(id);
        });
    });

    it('should return an unvalid status when validator validation fails', () => {
      var
        recurseFieldValidationStub = sandbox.stub().returns(true),
        controllerName = 'aController',
        actionName = 'anAction',
        filterId = 'someFilter',
        testStub = sandbox.stub().resolves(['anotherFilter']),
        dsl = {
          test: testStub
        },
        id = 'anId',
        structuredError = false,
        documentBody = {},
        specification = {
          [indexName]: {
            [collectionName]: {
              strict: true,
              fields: {
                children: {
                  aField: 'validation'
                }
              },
              validators: filterId
            }
          }
        };

      validation.specification = specification;
      validation.recurseFieldValidation = recurseFieldValidationStub;
      validation.dsl = dsl;
      Validation.__set__('addErrorMessage', sandbox.spy(function() {arguments[1].push(arguments[2]);}));

      return validation.validationPromise(indexName, collectionName, controllerName, actionName, id, documentBody, structuredError)
        .then((result) => {
          should(result).be.deepEqual({
            documentBody,
            errorMessages: ['The document does not match validation filters.'],
            validation: false
          });
          should(recurseFieldValidationStub.callCount).be.eql(1);
          should(recurseFieldValidationStub.args[0][0]).be.deepEqual(documentBody);
          should(recurseFieldValidationStub.args[0][1]).be.eql(null);
          should(recurseFieldValidationStub.args[0][2]).be.eql(specification[indexName][collectionName].fields.children);
          should(recurseFieldValidationStub.args[0][3]).be.true();
          should(recurseFieldValidationStub.args[0][5]).be.eql(structuredError);
          should(testStub.callCount).be.eql(1);
          should(testStub.args[0][0]).be.deepEqual(indexName);
          should(testStub.args[0][1]).be.deepEqual(collectionName);
          should(testStub.args[0][2]).be.deepEqual(documentBody);
          should(testStub.args[0][3]).be.deepEqual(id);
        });
    });

    it('should intercept a strictness error and set the message accordingly return a validation if the specification is empty', () => {
      var
        recurseFieldValidationStub = sandbox.stub().throws({message: 'strictness'}),
        controllerName = 'aController',
        actionName = 'anAction',
        id = null,
        structuredError = false,
        documentBody = {},
        specification = {
          [indexName]: {
            [collectionName]: {
              strict: true,
              fields: {
                children: {
                  aField: 'validation'
                }
              },
              validators: null
            }
          }
        };

      validation.specification = specification;
      validation.recurseFieldValidation = recurseFieldValidationStub;
      Validation.__set__('addErrorMessage', sandbox.spy(function() {return arguments[1].push(arguments[2]);}));

      return validation.validationPromise(indexName, collectionName, controllerName, actionName, id, documentBody, structuredError)
        .then((result) => {
          should(result).be.deepEqual({
            documentBody,
            errorMessages: ['The document validation is strict; it can not add unspecified sub-fields.'],
            validation: false
          });
        });
    });

    it('should throw back any other error happening during field validation', () => {
      var
        recurseFieldValidationStub = sandbox.stub().throws({message: 'not_strictness'}),
        controllerName = 'aController',
        actionName = 'anAction',
        id = null,
        structuredError = false,
        documentBody = {},
        specification = {
          [indexName]: {
            [collectionName]: {
              strict: true,
              fields: {
                children: {
                  aField: 'validation'
                }
              },
              validators: null
            }
          }
        };

      validation.specification = specification;
      validation.recurseFieldValidation = recurseFieldValidationStub;
      Validation.__set__('addErrorMessage', sandbox.spy(function() {return arguments[1].push(arguments[2]);}));

      return validation.validationPromise(indexName, collectionName, controllerName, actionName, id, documentBody, structuredError)
        .should.rejectedWith('not_strictness');
    });
    /**
     * TODO (update case)
     */
  });

  describe('#recurseFieldValidation', () => {
    /**
     * TODO
     */
  });
});