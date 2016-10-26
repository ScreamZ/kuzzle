var
  PluginImplementationError = require('kuzzle-common-objects').Errors.pluginImplementationError,
  InternalError = require('kuzzle-common-objects').Errors.internalError,
  BadRequestError = require('kuzzle-common-objects').Errors.badRequestError,
  _ = require('lodash'),
  mandatoryFieldSpecProperties = ['type'],
  Promise = require('bluebird'),
  Dsl = require('../../dsl');

/**
 * @param {Kuzzle} kuzzle
 * @constructor
 */
function Validation (kuzzle) {
  /** @type {Kuzzle} */
  this.kuzzle = kuzzle;

  /** @type {...ValidationType} */
  this.types = {};

  /** @type {string[]} */
  this.typeAllowsChildren = [];

  /** @type {DocumentSpecification} */
  this.specification = {};

  /** @type {Dsl} */
  this.dsl = new Dsl();

  this.rawConfiguration = {};
}

/**
 * Walks through all types in "defaultTypesFiles" initializes all types
 */
Validation.prototype.init = function () {
  var
    ValidationType;

  [
    'anything',
    'boolean',
    'date',
    'email',
    'enum',
    'geoPoint',
    'geoShape',
    'integer',
    'ipAddress',
    'numeric',
    'object',
    'string',
    'url'
  ].forEach(typeFile => {
    ValidationType = require(`./types/${typeFile}`);
    this.addType(new ValidationType());
  });
};

/**
 * @param {RequestObject} requestObject
 * @returns {Promise}
 * @throws BadRequestError
 */
Validation.prototype.validate = function (requestObject) {
  if (!requestObject.hasOwnProperty('data')) {
    throw new BadRequestError('The request object must provide data');
  }

  if (!requestObject.data.hasOwnProperty('body')) {
    throw new BadRequestError('The request object must provide a document body');
  }

  if (requestObject.controller === 'write' && requestObject.action === 'update') {
    if (!requestObject.data.hasOwnProperty('_id')) {
      throw new BadRequestError('Update request must provide an _id.');
    }
  }

  return this.validationPromise(requestObject, false);
};

/**
 * @param {RequestObject} requestObject
 * @param {boolean} verbose
 * @returns {Promise.<{documentBody: *, errorMessages:string[], validation: boolean}>}
 */
Validation.prototype.validationPromise = function (requestObject, verbose) {
  var
    id = (requestObject.data && requestObject.data._id) ? requestObject.data._id : null,
    updateBodyClone,
    isUpdate = false,
    collectionSpec = {};

  verbose = typeof verbose !== 'undefined' && verbose;

  if (this.specification && this.specification[requestObject.index] && this.specification[requestObject.index][requestObject.collection]) {
    collectionSpec = this.specification[requestObject.index][requestObject.collection];
  }

  return new Promise(resolve => {
    var updateRequestObject;

    if (requestObject.controller === 'write' && requestObject.action === 'update') {
      isUpdate = true;
      updateRequestObject = {
        index: requestObject.index,
        collection: requestObject.collection,
        controller: 'read',
        action: 'get',
        data: {_id: id}
      };
      this.kuzzle.services.list.storageEngine.get(updateRequestObject).then(document => {
        // Avoid side effects on the requestObject during the update validation
        updateBodyClone = _.cloneDeep(requestObject.data.body);

        _.defaultsDeep(updateBodyClone, document._source);

        return resolve(updateBodyClone);
      });
    }
    else {
      return resolve(requestObject.data.body);
    }
  }).then(documentBody => {
    var
      validation = true,
      errorMessages = verbose ? {} : [];

    if (collectionSpec) {
      if (collectionSpec.fields && collectionSpec.fields.children) {
        try {
          validation = validation && this.recurseFieldValidation(documentBody, collectionSpec.fields.children, collectionSpec.strict, errorMessages, verbose);
        }
        catch (error) {
          if (error.message === 'strictness') {
            // The strictness message can be received here only if it happens at the validation of the document's root
            manageErrorMessage('document', errorMessages, 'The document validation is strict; it can not add unspecified sub-fields.', verbose);
            validation = false;
          }
          else {
            throw error;
          }
        }
      }

      if (collectionSpec.validators) {
        return this.dsl.test(requestObject.index, requestObject.collection, documentBody, id)
          .then(filters => {
            if (!filters.length > 0 || filters[0] !== collectionSpec.validators) {
              validation = false;
              manageErrorMessage('document', errorMessages, 'The document does not match validation filters.', verbose);
            }

            return {
              errorMessages: errorMessages,
              validation: validation
            };
          });
      }
    }

    return {
      errorMessages: errorMessages,
      validation: validation
    };
  })
    .then(validationObject => {
      if (!verbose) {
        // We only modify the requestObject if the validation succeeds
        if (collectionSpec.fields && collectionSpec.fields.children) {
          requestObject.data.body = this.recurseApplyDefault(isUpdate, requestObject.data.body, collectionSpec.fields.children);
        }

        return requestObject;
      }

      return validationObject;
    });
};

/**
 * @param {boolean} isUpdate
 * @param {*} documentSubset
 * @param {...StructuredFieldSpecification} collectionSpecSubset
 */
Validation.prototype.recurseApplyDefault = function (isUpdate, documentSubset, collectionSpecSubset) {
  Object.keys(collectionSpecSubset).forEach(fieldName => {
    var i;

    if (
      documentSubset.hasOwnProperty(fieldName) &&
      this.types[collectionSpecSubset[fieldName].type].allowChildren &&
      collectionSpecSubset[fieldName].children
    ) {
      if (Array.isArray(documentSubset[fieldName])) {
        for (i = 0; i < documentSubset[fieldName].length; i++) {
          documentSubset[fieldName][i] = this.recurseApplyDefault(isUpdate, documentSubset[fieldName][i], collectionSpecSubset[fieldName].children);
        }
      }
      else {
        documentSubset[fieldName] = this.recurseApplyDefault(isUpdate, documentSubset[fieldName], collectionSpecSubset[fieldName].children);
      }
    }
    else if (collectionSpecSubset[fieldName].defaultValue && !isUpdate && (!documentSubset.hasOwnProperty(fieldName) || documentSubset[fieldName] === null)) {
      documentSubset[fieldName] = collectionSpecSubset[fieldName].defaultValue;
    }
    else if (collectionSpecSubset[fieldName].defaultValue && isUpdate && documentSubset.hasOwnProperty(fieldName) && documentSubset[fieldName] === null) {
      documentSubset[fieldName] = collectionSpecSubset[fieldName].defaultValue;
    }
  });

  return documentSubset;
};

/**
 * @param {*} documentSubset
 * @param {StructuredFieldSpecification} collectionSpecSubset
 * @param {boolean} strictness
 * @param {string[]} errorMessages
 * @param {boolean} verbose
 */
Validation.prototype.recurseFieldValidation = function (documentSubset, collectionSpecSubset, strictness, errorMessages, verbose) {
  if (strictness) {
    if (!checkAllowedProperties(documentSubset, Object.keys(collectionSpecSubset))) {
      // We use a throw to be able to provide information about the field or the document in whole
      throw new BadRequestError('strictness');
    }
  }

  if (!verbose) {
    // We stop as soon as one field is not valid
    return Object.keys(collectionSpecSubset).every(fieldName => {
      return this.isValidField(fieldName, documentSubset, collectionSpecSubset, strictness, errorMessages, verbose);
    });
  }

  // We try to validate every field in order to get all error messages if any
  return Object.keys(collectionSpecSubset).reduce((reductionResult, fieldName) => {
    return this.isValidField(fieldName, documentSubset, collectionSpecSubset, strictness, errorMessages, verbose) && reductionResult;
  }, true);
};

/**
 * @param {string} fieldName
 * @param {*} documentSubset
 * @param {StructuredFieldSpecification} collectionSpecSubset
 * @param {boolean} strictness
 * @param {string[]} errorMessages
 * @param {boolean} verbose
 * @returns {boolean}
 */
Validation.prototype.isValidField = function (fieldName, documentSubset, collectionSpecSubset, strictness, errorMessages, verbose) {
  var
    nestedStrictness,
    /** @type StructuredFieldSpecification */
    field = collectionSpecSubset[fieldName],
    fieldValues,
    i,
    fieldErrors,
    result = true;

  if (field.mandatory && !field.hasOwnProperty('defaultValue') && (!documentSubset.hasOwnProperty(fieldName) || typeof documentSubset[fieldName] === 'undefined' || documentSubset[fieldName] === null)) {
    manageErrorMessage(field.path, errorMessages, 'The field is mandatory.', verbose);
    return false;
  }

  if (documentSubset.hasOwnProperty(fieldName) && typeof documentSubset[fieldName] !== 'undefined' && documentSubset[fieldName] !== null) {
    if (field.multivalued.value) {
      if (!Array.isArray(documentSubset[fieldName])) {
        manageErrorMessage(field.path, errorMessages, 'The field must be multivalued, unary value provided.', verbose);
        return false;
      }

      if (field.multivalued.hasOwnProperty('minCount') && documentSubset[fieldName].length < field.multivalued.minCount) {
        manageErrorMessage(field.path, errorMessages, `Not enough elements. Minimum count is set to ${field.multivalued.minCount}.`, verbose);
        return false;
      }

      if (field.multivalued.hasOwnProperty('maxCount') && documentSubset[fieldName].length > field.multivalued.maxCount) {
        manageErrorMessage(field.path, errorMessages, `Too many elements. Maximum count is set to ${field.multivalued.maxCount}.`, verbose);
        return false;
      }

      fieldValues = documentSubset[fieldName];
    }
    else {
      if (Array.isArray(documentSubset[fieldName])) {
        manageErrorMessage(field.path, errorMessages, 'The field is not a multivalued field; Multiple values provided.', verbose);
        return false;
      }

      fieldValues = [documentSubset[fieldName]];
    }

    if (this.types[field.type].allowChildren) {
      nestedStrictness = this.types[field.type].getStrictness(field.typeOptions, strictness);
    }

    for (i = 0; i < fieldValues.length; i++) {
      fieldErrors = [];

      if (!this.types[field.type].validate(field.typeOptions, fieldValues[i], fieldErrors)) {
        if (fieldErrors.length === 0) {
          // We still want to trigger an error, even if no message is provided
          manageErrorMessage(field.path, errorMessages, 'An error has occurred during validation.', verbose);
        }
        else {
          fieldErrors.forEach(message => manageErrorMessage(field.path, errorMessages, message, verbose));
        }

        return false;
      }

      if (this.types[field.type].allowChildren && field.children) {
        try {
          if (!this.recurseFieldValidation(fieldValues[i], field.children, nestedStrictness, errorMessages, verbose)) {
            result = false;
          }
        }
        catch (error) {
          if (error.message === 'strictness') {
            manageErrorMessage(field.path, errorMessages, 'The field is set to "strict"; cannot add unspecified subField.', verbose);
          }
          else if (verbose) {
            manageErrorMessage(field.path, errorMessages, error.message, verbose);
          }
          else {
            throw error;
          }

          result = false;
        }
      }
    }
  }

  return result;
};

/**
 * @returns {Promise.<T>}
 */
Validation.prototype.curateSpecification = function () {
  var
    promises = [],
    specification = {};

  return getValidationConfiguration(this.kuzzle)
    .then(validation => {
      this.rawConfiguration = validation;

      Object.keys(this.rawConfiguration).forEach(indexName => {
        Object.keys(this.rawConfiguration[indexName]).forEach(collectionName => {
          var promise = new Promise((resolve) => {
            this.curateCollectionSpecification(indexName, collectionName, this.rawConfiguration[indexName][collectionName])
              .then(curatedSpec => {
                if (!specification.hasOwnProperty(indexName)) {
                  specification[indexName] = {};
                }

                specification[indexName][collectionName] = curatedSpec;

                this.kuzzle.pluginsManager.trigger('log:info', `Validation specification for ${indexName} / ${collectionName} has been loaded.`);
                return resolve({});
              })
              .catch(error => {
                this.kuzzle.pluginsManager.trigger('log:error', `Specification for the collection ${collectionName} triggered an error`);
                this.kuzzle.pluginsManager.trigger('log:error', `Error: ${error.message}`);
                return resolve({});
              });
          });

          promises.push(promise);
        });
      });

      return Promise
        .all(promises)
        .then(() => {
          this.kuzzle.pluginsManager.trigger('log:info', 'All validation specifications have been treated.');
          this.specification = specification;
        });
    });
};

/**
 * @param {string} indexName
 * @param {string} collectionName
 * @param {CollectionSpecification} collectionSpec
 * @returns {Promise<boolean>}
 */
Validation.prototype.isValidSpecification = function (indexName, collectionName, collectionSpec) {
  // We make a deep clone to avoid side effects
  var specification = _.cloneDeep(collectionSpec);

  return new Promise (resolve => {
    this
      .curateCollectionSpecification(indexName, collectionName, specification, true)
      .then(() => {
        return resolve(true);
      })
      .catch(() => {
        return resolve(false);
      });
  });
};

/**
 * @param {string} indexName
 * @param {string} collectionName
 * @param {CollectionSpecification} collectionSpec
 * @param {boolean} dryRun
 * @returns {CollectionSpecification}
 * @rejects InternalError
 */
Validation.prototype.curateCollectionSpecification = function (indexName, collectionName, collectionSpec, dryRun) {
  dryRun = dryRun || false;

  return new Promise((resolve, reject) => {
    var
      treatedSpecification = {
        strict: collectionSpec.strict || false,
        fields: {},
        validators: null
      };

    if (!checkAllowedProperties(collectionSpec, ['strict', 'fields', 'validators'])) {
      return reject(new InternalError('The collection specification has invalid properties.'));
    }

    if (collectionSpec.fields) {
      try {
        treatedSpecification.fields = this.structureCollectionValidation(collectionSpec);
      }
      catch (error) {
        return reject(error);
      }
    }

    if (collectionSpec.validators && Array.isArray(collectionSpec.validators)) {
      this
        .curateValidatorFilter(indexName, collectionName, collectionSpec.validators, dryRun)
        .then(validationFilter => {
          treatedSpecification.validators = validationFilter.id;

          return resolve(treatedSpecification);
        })
        .catch(error => {
          this.kuzzle.pluginsManager.trigger('log:error', error);
          return reject(new InternalError('Validator specification of the collection triggered an error'));
        });
    }
    else {
      return resolve(treatedSpecification);
    }
  });
};

Validation.prototype.structureCollectionValidation = function (collectionSpec) {
  var
    fields = {},
    maxDepth = 0;

  Object.keys(collectionSpec.fields).forEach(fieldName => {
    var
      field,
      // We deep clone the field because we will modify it
      fieldSpecClone = _.cloneDeep(collectionSpec.fields[fieldName]);

    try {
      field = this.curateFieldSpecification(fieldSpecClone);
      field.path = fieldName.split('/');
      field.depth = field.path.length;
      if (field.depth > maxDepth) {
        maxDepth = field.depth;
      }

      if (!fields[field.depth]) {
        fields[field.depth] = [];
      }

      fields[field.depth].push(field);
    }
    catch (error) {
      this.kuzzle.pluginsManager.trigger('log:error', error);
      throw new InternalError(`Specification for the field ${fieldName} triggered an error`);
    }
  });

  if (Object.keys(fields).length > 0) {
    return curateStructuredFields(this.typeAllowsChildren, fields, maxDepth);
  }

  return {};
};

/**
 * @param {FieldSpecification} fieldSpec
 * @returns {FieldSpecification}
 * @throws InternalError
 */
Validation.prototype.curateFieldSpecification = function (fieldSpec) {
  var returnedTypeOptions;

  this.curateFieldSpecificationFormat(fieldSpec);

  _.defaultsDeep(fieldSpec, {
    'mandatory': false,
    'multivalued': {
      value: false
    }
  });

  if (!fieldSpec.hasOwnProperty('typeOptions')) {
    fieldSpec.typeOptions = {};
  }

  if (!checkAllowedProperties(fieldSpec.typeOptions, this.types[fieldSpec.type].allowedTypeOptions || [])) {
    throw new InternalError(`Field of type ${fieldSpec.type} is not specified properly`);
  }

  returnedTypeOptions = this.types[fieldSpec.type].validateFieldSpecification(fieldSpec.typeOptions);

  if (typeof returnedTypeOptions === 'boolean') {
    if (returnedTypeOptions) {
      return fieldSpec;
    }

    throw new InternalError(`Field of type ${fieldSpec.type} is not specified properly`);
  }
  else {
    fieldSpec.typeOptions = returnedTypeOptions;

    return fieldSpec;
  }
};

/**
 * @param {FieldSpecification} fieldSpec
 * @returns {boolean}
 * @throws InternalError
 */
Validation.prototype.curateFieldSpecificationFormat = function (fieldSpec) {
  if (!checkAllowedProperties(fieldSpec, ['mandatory', 'type', 'defaultValue', 'description', 'multivalued', 'typeOptions'])) {
    throw new InternalError('The field specification has invalid properties.');
  }

  mandatoryFieldSpecProperties.forEach(propertyName => {
    if (!fieldSpec.hasOwnProperty(propertyName)) {
      throw new InternalError(`${propertyName} is a mandatory field specification property.`);
    }
  });

  if (!this.types[fieldSpec.type]) {
    throw new InternalError(`${fieldSpec.type} is not a recognized type.`);
  }

  if (fieldSpec.hasOwnProperty('multivalued')) {
    if (!checkAllowedProperties(fieldSpec.multivalued, ['value', 'minCount', 'maxCount'])) {
      throw new InternalError('The multivalued field specification has invalid properties.');
    }

    if (!fieldSpec.multivalued.hasOwnProperty('value')) {
      throw new InternalError('"value" is a mandatory property for multivalued field specification.');
    }

    if (!fieldSpec.multivalued.value && (fieldSpec.multivalued.hasOwnProperty('minCount'))) {
      throw new InternalError('"minCount" is not valid when multivalued field is disabled.');
    }

    if (!fieldSpec.multivalued.value && (fieldSpec.multivalued.hasOwnProperty('maxCount'))) {
      throw new InternalError('"maxCount" is not valid when multivalued field is disabled.');
    }

    if (fieldSpec.multivalued.hasOwnProperty('minCount') && fieldSpec.multivalued.hasOwnProperty('maxCount') && fieldSpec.multivalued.minCount > fieldSpec.multivalued.maxCount) {
      throw new InternalError('"minCount" can not be greater than "maxCount".');
    }
  }

  return true;
};

/**
 * @param {string} indexName
 * @param {string} collectionName
 * @param {*} validatorFilter
 * @param {boolean} dryRun
 * @returns {Promise}
 */
Validation.prototype.curateValidatorFilter = function (indexName, collectionName, validatorFilter, dryRun) {
  var
    promise,
    sandboxDsl = new Dsl(),
    query = {
      bool: {
        must: validatorFilter
      }
    };

  promise = sandboxDsl.register(indexName, collectionName, query);

  if (!dryRun) {
    promise.then(() => {
      return this.dsl.register(indexName, collectionName, query);
    });
  }

  return promise;
};

/**
 * @param {ValidationType} validationType
 * @throws {PluginImplementationError}
 */
Validation.prototype.addType = function (validationType) {
  if (!validationType.typeName) {
    throw new PluginImplementationError('The typeName property must be defined in the validation type object.');
  }

  if (!validationType.validate || typeof validationType.validate !== 'function') {
    throw new PluginImplementationError(`The type ${validationType.typeName} must implement the function 'validate'.`);
  }

  if (!validationType.validateFieldSpecification || typeof validationType.validateFieldSpecification !== 'function') {
    throw new PluginImplementationError(`The type ${validationType.typeName} must implement the function 'validateFieldSpecification'.`);
  }

  if (validationType.hasOwnProperty('allowChildren') && validationType.allowChildren) {
    if (!validationType.getStrictness || typeof validationType.getStrictness !== 'function') {
      throw new PluginImplementationError(`The allowing children type ${validationType.typeName} must implement the function 'getStrictness'.`);
    }

    this.typeAllowsChildren.push(validationType.typeName);
  }

  if (this.types[validationType.typeName]) {
    throw new PluginImplementationError(`The type ${validationType.typeName} is already defined.`);
  }

  this.types[validationType.typeName] = validationType;
};

/**
 * @param {*} object
 * @param {string[]} allowedProperties
 * @returns {boolean}
 */
function checkAllowedProperties(object, allowedProperties) {
  if (typeof object !== 'object' || Array.isArray(object) || object === null) {
    return false;
  }

  return !Object.keys(object).some(propertyName => allowedProperties.indexOf(propertyName) === -1);
}

/**
 * @param {string[]} typeAllowsChildren
 * @param {StructuredFieldSpecification[][]} fields
 * @param {number} maxDepth : depth of the fields; counting starts at 1
 * @throws InternalError
 */
function curateStructuredFields(typeAllowsChildren, fields, maxDepth) {
  var
    i,
    structuredFields = {
      children: {},
      root: true
    };

  for (i = 1; i <= maxDepth; i++) {
    if (!fields.hasOwnProperty(i)) {
      throw new InternalError('All levels of an object have to be defined in the specification.');
    }

    fields[i].forEach(field => {
      var
        parent,
        childKey = field.path[field.path.length - 1];

      parent = getParent(structuredFields, field.path);

      if (!parent.root && typeAllowsChildren.indexOf(parent.type) === -1) {
        throw new InternalError(`The field type ${parent.type} is not allowed to have children fields.`);
      }

      if (!parent.hasOwnProperty('children')) {
        parent.children = {};
      }

      parent.children[childKey] = field;
    });
  }

  return structuredFields;
}

/**
 * @param {StructuredFieldSpecification} structuredFields
 * @param {string[]}fieldPath
 * @returns {StructuredFieldSpecification}
 */
function getParent(structuredFields, fieldPath) {
  var
    i,
    pointer = structuredFields;

  if (fieldPath.length === 1) {
    return structuredFields;
  }

  for (i = 0; i < fieldPath.length - 1; i++) {
    if (!pointer.children.hasOwnProperty(fieldPath[i])) {
      throw new InternalError(`The parent field of the field "${fieldPath.join('.')}" is not defined.`);
    }

    pointer = pointer.children[fieldPath[i]];
  }

  return pointer;
}

/**
 * @param {string|string[]} context
 * @param {string[]|{documentScope:string[], fieldScope: {children: ...*}}} errorHolder
 * @param {string} message
 * @param {boolean} structured
 */
function manageErrorMessage(context, errorHolder, message, structured) {
  var
    i,
    pointer;

  if (structured) {
    if (context === 'document') {
      if (!errorHolder.documentScope) {
        errorHolder.documentScope = [];
      }

      errorHolder.documentScope.push(message);
    }
    else {
      if (!errorHolder.fieldScope) {
        errorHolder.fieldScope = {};
      }

      pointer = errorHolder.fieldScope;

      for (i = 0; i < context.length; i++) {
        if (!pointer.children) {
          pointer.children = {};
        }

        if (!pointer.children.hasOwnProperty(context[i])) {
          pointer.children[context[i]] = {};
        }
        pointer = pointer.children[context[i]];
      }

      if (!pointer.hasOwnProperty('messages')) {
        pointer.messages = [];
      }

      pointer.messages.push(message);
    }
  }
  else if (context === 'document') {
    throw new BadRequestError(`Document: ${message}`);
  }
  else {
    throw new BadRequestError(`Field ${context.join('.')}: ${message}`);
  }
}

/**
 * Retrieve the plugins list from the database and returns it,
 * along with their configuration
 *
 * @param kuzzle
 * @returns {Promise}
 */
function getValidationConfiguration(kuzzle) {

  return kuzzle.internalEngine
    .search('validations', false, 0, 1000)
    .then(result => {
      var
        validation = {};

      if (result.hits.length > 0) {
        result.hits.forEach(p => {
          if (!validation[p._source.index]) {
            validation[p._source.index] = {};
          }
          validation[p._source.index][p._source.collection] = p._source.validation;
        });
      }
      else if (kuzzle.config.validation) {
        // We can't wait prepareDb as it runs outside of the rest of the start
        validation = kuzzle.config.validation;
      }

      return Promise.resolve(validation);
    });
}

module.exports = Validation;