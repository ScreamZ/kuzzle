var
  crypto = require('crypto'),
  stringify = require('json-stable-stringify'),
  Promise = require('bluebird'),
  NotFoundError = require('kuzzle-common-objects').Errors.notFoundError;

/**
 * Real-time engine filters storage
 * @constructor
 */
function Storage () {
  this.storeOperand = require('./storeOperands');
  this.removeOperand = require('./removeOperands');

  /**
   * Filter => Subfilter link table
   * A filter is made of subfilters. Each subfilter is to be tested
   * against OR operands, meaning if at least 1 subfilter matches, the
   * whole filter matches.
   *
   * @type {Object}
   *
   * @example
   *  {
   *    filterId: {
   *      index: 'index',
   *      collection: 'collection',
   *      raw: [],
   *      subfilters: [subfilter1, subfilter3, subfilter4]
   *    },
   *  }
   */
  this.filters = {};

  /**
   * Subfilters link table
   *
   * A subfilter is a set of conditions to be tested against
   * AND operands. If at least 1 condition returns false, then
   * the whole subfilter is false.
   *
   * @type {Object}
   *
   * @example
   *  {
   *    index: {
   *      collection: {
   *        subfilterId: {
   *          id: subfilterId,
   *          filters: [filter1, filter2, filter...],
   *          conditions: [conditionId1, conditionId2, ...]
   *        }
   *      }
   *    }
   *  }
   */
  this.subfilters = {};


  /**
   * Conditions description
   * A condition is made of a DSL keyword, a document field name, and
   * the associated test values
   *
   * @type {Object}
   *
   * @example
   *  {
   *    index: {
   *      collection: {
   *        conditionId: {
   *          id: conditionId,
   *          subfilters: [subfilter1, subfilter2, ...],
   *          keyword: 'DSL keyword',
   *          value: // DSL keyword specific
   *        }
   *      }
   *    }
   *  }
   */
  this.conditions = {};

  /**
   * Contains field-operand pairs to be tested
   * A field-operand pair is a DSL keyword applied to a document field
   *
   * @type {Object}
   *
   * @example
   *  {
   *    index: {
   *      collection: {
   *        [operandName]: {
   *          [documentFieldName]: {
   *            conditions: [condition1, condition2, ...],
   *            <operand specific storage>
   *          }
   *        }
   *      }
   *    }
   *  }
   */
  this.foPairs = {};

  /**
   * Contains reference tables.
   * Each time a document is to be matched against registered
   * filters, the corresponding reference table is duplicated
   * and is used to keep track of (in)validated conditions, and
   * eventually skipping tests if possible.
   *
   * @type {Object}
   *
   * @example
   *  {
   *    index: {
   *      collection: {
   *        subfilterId: [subfilter, state, conditionsCount, filtersCount],
   *        subfilterId: [subfilter, state, conditionsCount, filtersCount],
   *        subfilterId: [subfilter, state, conditionsCount, filtersCount],
   *        ...
   *      }
   *    }
   *  }
   */
  this.testTables = {};

  /**
   * Simple enum to access to this.testTables' array elements
   * without using magic numbers throughout the code, ensuring
   * maintenability
   *
   * @type {Object}
   */
  this.testField = {
    SUBFILTER: 0,
    STATE: 1,
    CONDITIONS_COUNT: 2,
    FILTERS_COUNT: 3
  };

  /**
   * Decomposes and stores a normalized filter
   *
   * @param {string} index
   * @param {string} collection
   * @param {Array} filters
   * @return {Object}
   */
  this.store = function (index, collection, filters) {
    var
      diff = false,
      result;

    result = addFilter(this.filters, index, collection, filters);

    if (!result.created) {
      return {diff, id: result.id, filter: filters};
    }

    filters.forEach(sf => {
      var
        sfResult = addSubfilter(this.filters[result.id], this.subfilters, sf),
        addedConditions,
        subfilter = this.subfilters[index][collection][sfResult.id];

      if (sfResult.created) {
        diff = true;
        addedConditions = addConditions(subfilter, this.conditions, index, collection, sf);

        addTestTables(this.testTables, subfilter, index, collection, sfResult.id);

        addIndexCollectionToObject(this.foPairs, index, collection);

        addedConditions.forEach(cond => {
          if (!this.foPairs[index][collection][cond.keyword]) {
            this.foPairs[index][collection][cond.keyword] = {};
          }

          this.storeOperand[cond.keyword](this.foPairs[index][collection][cond.keyword], cond);
        });
      }
      else {
        this.testTables[index][collection][sfResult.id][this.testField.FILTERS_COUNT]++;
      }
    });

    return {diff, id: result.id, filter: filters};
  };

  /**
   * Remove a filter ID from the storage
   * @param {string} filterId
   * @return {Promise}
   */
  this.remove = function (filterId) {
    var
      index,
      collection;

    if (!this.filters[filterId]) {
      return Promise.reject(new NotFoundError(`Unable to remove filter "${filterId}": filter not found`));
    }

    index = this.filters[filterId].index;
    collection = this.filters[filterId].collection;

    this.filters[filterId].subfilters.forEach(subfilter => {
      if (subfilter.filters.length === 1) {
        subfilter.conditions.forEach(condition => {
          if (condition.subfilters.length === 1) {
            this.removeOperand[condition.keyword](this.foPairs, index, collection, condition);
            delete this.conditions[index][collection][condition.id];
          }
          else {
            condition.subfilters.splice(condition.subfilters.indexOf(subfilter), 1);
          }
        });

        delete this.testTables[index][collection][subfilter.id];
      }
      else {
        subfilter.filters.splice(subfilter.filters.indexOf(this.filters[filterId]), 1);
        this.testTables[index][collection][subfilter.id][this.testField.FILTERS_COUNT]--;
      }
    });

    delete this.filters[filterId];
  };

  return this;
}

/**
 * Add a filter ID to the filters structure.
 * Returns a boolean indicating if the insertion was successful,
 * or, if false, indicating that the filter was already registered
 *
 * @param {Object} filtersObj - filters structure
 * @param {String} index
 * @param {String} collection
 * @param {Object} filters
 * @return {Object} containing a "created" boolean flag and the filter id
 */
function addFilter(filtersObj, index, collection, filters) {
  var
    id = crypto.createHash('md5').update(stringify({
      index,
      collection,
      filters
    })).digest('hex'),
    created = !filtersObj[id];

  if (created) {
    filtersObj[id] = {
      index,
      collection,
      raw: filters,
      subfilters: []
    };
  }

  return {created, id};
}

/**
 * Adds a subfilter to the subfilters structure.
 * Link it to the corresponding filter
 *
 * Return value contains the "created" boolean indicating
 * if the subfilter has been created or updated.
 * If false, nothing changed.
 *
 * @param {Object} filtersObj
 * @param {Object} subFiltersObj
 * @param {Array} subfilter
 * @return {Object}
 */
function addSubfilter(filtersObj, subFiltersObj, subfilter) {
  var
    sfId = crypto.createHash('md5').update(stringify(subfilter)).digest('hex'),
    sfRef,
    created = true;

  addIndexCollectionToObject(subFiltersObj, filtersObj.index, filtersObj.collection);

  if (subFiltersObj[filtersObj.index][filtersObj.collection][sfId]) {
    sfRef = subFiltersObj[filtersObj.index][filtersObj.collection][sfId];

    if (sfRef.filters.indexOf(filtersObj) !== -1) {
      created = false;
    }
    else {
      sfRef.filters.push(filtersObj);
      filtersObj.subfilters.push(sfRef);
    }
  }
  else {
    subFiltersObj[filtersObj.index][filtersObj.collection][sfId] = {
      id: sfId,
      filters: [filtersObj],
      conditions: []
    };
    filtersObj.subfilters.push(subFiltersObj[filtersObj.index][filtersObj.collection][sfId]);
  }

  return {created, id: sfId};
}

/**
 * Adds conditions registered in a subfilter to the conditions
 * structure, and link them to the corresponding subfilter structure
 *
 * Returns the list of created conditions
 *
 * @param {Object} sfObj - link to the corresponding subfilter in the
 *                         subfilters structure
 * @param {Object} condObj - conditions object structure
 * @param {string} index
 * @param {string} collection
 * @param {Array} subfilter - array of conditions
 * @return {Array}
 */
function addConditions(sfObj, condObj, index, collection, subfilter) {
  var diff = [];

  addIndexCollectionToObject(condObj, index, collection);

  subfilter.forEach(cond => {
    var
      cId = crypto.createHash('md5').update(stringify(cond)).digest('hex'),
      condLink = condObj[index][collection][cId],
      keyword;

    if (condLink) {
      if (condLink.subfilters.indexOf(sfObj) === -1) {
        condLink.subfilters.push(sfObj);
        sfObj.conditions.push(condLink);
        diff.push(condLink);
      }
    }
    else {
      keyword = Object.keys(cond)[0];

      if (cond.not) {
        keyword = 'not' + keyword;
      }

      condObj[index][collection][cId] = {
        id: cId,
        subfilters: [sfObj],
        keyword,
        value: cond[keyword],
      };
      sfObj.conditions.push(condObj[index][collection][cId]);
      diff.push(condObj[index][collection][cId]);
    }
  });

  return diff;
}

/**
 * Updates the test tables with a new subfilter
 *
 * @param {Object} testTables referebce
 * @param {Object} subfilter to be added
 * @param {string} index
 * @param {string} collection
 * @param {string} id - subfilter unique identifier
 */
function addTestTables(testTables, subfilter, index, collection, id) {
  addIndexCollectionToObject(testTables, index, collection);

  testTables[index][collection][id] = [
    subfilter,
    null,
    subfilter.conditions.length,
    subfilter.filters.length
  ];
}

/**
 * Many storage objects separate data by index and collection.
 * This function avoids repetition of code by initializing an
 * object with an index and collection
 *
 * @param {Object} obj - object to update
 * @param {String} index
 * @param {String} collection
 */
function addIndexCollectionToObject(obj, index, collection) {
  if (!obj[index]) {
    obj[index] = { [collection]: {} };
  }
  else if (!obj[index][collection]) {
    obj[index][collection] = {};
  }
}

module.exports = Storage;