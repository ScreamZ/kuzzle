var
  rewire = require('rewire'),
  BaseType = require('../../../../../lib/api/core/validation/baseType'),
  GeoShapeType = rewire('../../../../../lib/api/core/validation/types/geoShape'),
  should = require('should'),
  sinon = require('sinon');

describe('Test: validation/types/geoShape', () => {
  var
    geoShapeType = new GeoShapeType(),
    sandbox = sinon.sandbox.create(),
    isPoint = GeoShapeType.__get__('isPoint'),
    isPolygonPart = GeoShapeType.__get__('isPolygonPart'),
    isLine = GeoShapeType.__get__('isLine'),
    isPolygon = GeoShapeType.__get__('isPolygon'),
    isEnvelope = GeoShapeType.__get__('isEnvelope'),
    isPointEqual = GeoShapeType.__get__('isPointEqual'),
    checkStructure = geoShapeType.checkStructure,
    recursiveShapeValidation = geoShapeType.recursiveShapeValidation;

  beforeEach(() => {
    sandbox.reset();
    GeoShapeType.__set__('isPoint', isPoint);
    GeoShapeType.__set__('isLine', isLine);
    GeoShapeType.__set__('isPolygon', isPolygon);
    GeoShapeType.__set__('isPolygonPart', isPolygonPart);
    GeoShapeType.__set__('isEnvelope', isEnvelope);
    GeoShapeType.__set__('isPointEqual', isPointEqual);
  });

  it('should derivate from BaseType', () => {
    should(BaseType.prototype.isPrototypeOf(geoShapeType)).be.true();
  });

  it('should construct properly', () => {
    should(typeof geoShapeType.typeName).be.eql('string');
    should(typeof geoShapeType.allowChildren).be.eql('boolean');
    should(Array.isArray(geoShapeType.allowedTypeOptions)).be.true();
    should(geoShapeType.typeName).be.eql('geo_shape');
    should(geoShapeType.allowChildren).be.false();
  });

  it('should override functions properly',() => {
    should(typeof GeoShapeType.prototype.validate).be.eql('function');
    should(typeof GeoShapeType.prototype.validateFieldSpecification).be.eql('function');
  });

  describe('#validate', () => {

    afterEach(() => {
      geoShapeType.recursiveShapeValidation = recursiveShapeValidation;
    });

    it('should call recursiveShapeValidation', () => {
      var recursiveShapeValidationStub = sandbox.stub();
      geoShapeType.recursiveShapeValidation = recursiveShapeValidationStub;

      geoShapeType.validate({shapeTypes: ['shape']});

      should (recursiveShapeValidationStub.callCount).be.eql(1);
      should (recursiveShapeValidationStub.args[0][0]).be.deepEqual(['shape']);
    });
  });

  describe('#recursiveShapeValidation', () => {
    var
      checkStructureStub = sandbox.stub(),
      getDistanceStub = sandbox.stub();

    before(() => {
      GeoShapeType.__set__('geoUtils', {
        getDistance: getDistanceStub
      });
    });

    beforeEach(() => {
      geoShapeType.checkStructure = checkStructureStub;
    });

    afterEach(() => {
      geoShapeType.checkStructure = checkStructure;
    });

    it('should return false if structure is not valid', () => {
      var
        errorMessages = [],
        allowedShapes = ['allowed'],
        shape = {
          type: 'not_allowed',
          coordinates: ['some coordinates']
        };

      checkStructureStub.returns(false);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, errorMessages)).be.false();
      should(errorMessages).be.deepEqual([]);
    });

    it('should return true if point is valid', () => {
      var
        isPointStub = sandbox.stub().returns(true),
        allowedShapes = ['point'],
        shape = {
          type: 'point',
          coordinates: ['some coordinates']
        };

      checkStructureStub.returns(true);
      GeoShapeType.__set__('isPoint', isPointStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, [])).be.true();
      should(isPointStub.callCount).be.eql(1);
    });

    it('should return true if linestring is valid', () => {
      var
        isLineStub = sandbox.stub().returns(true),
        allowedShapes = ['linestring'],
        shape = {
          type: 'linestring',
          coordinates: ['some coordinates']
        };

      checkStructureStub.returns(true);
      GeoShapeType.__set__('isLine', isLineStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, [])).be.true();
      should(isLineStub.callCount).be.eql(1);
    });

    it('should return true if polygon is valid', () => {
      var
        isPolygonStub = sandbox.stub().returns(true),
        allowedShapes = ['polygon'],
        shape = {
          type: 'polygon',
          coordinates: ['some coordinates']
        };

      checkStructureStub.returns(true);
      GeoShapeType.__set__('isPolygon', isPolygonStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, [])).be.true();
      should(isPolygonStub.callCount).be.eql(1);
    });

    it('should return true if geometrycollection is valid', () => {
      var
        isPointStub = sandbox.stub().returns(true),
        allowedShapes = ['geometrycollection'],
        shape = {
          type: 'geometrycollection',
          geometries: [
            {
              type: 'point',
              coordinates: ['some coordinates']
            }
          ]
        };

      checkStructureStub.returns(true);
      GeoShapeType.__set__('isPoint', isPointStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, [])).be.true();
      should(isPointStub.callCount).be.eql(1);
    });

    it('should return true if envelope is valid', () => {
      var
        isEnvelopeStub = sandbox.stub().returns(true),
        allowedShapes = ['envelope'],
        shape = {
          type: 'envelope',
          coordinates: ['some coordinates']
        };

      checkStructureStub.returns(true);
      GeoShapeType.__set__('isEnvelope', isEnvelopeStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, [])).be.true();
      should(isEnvelopeStub.callCount).be.eql(1);
    });

    it('should return true if circle is valid', () => {
      var
        isPointStub = sandbox.stub().returns(true),
        allowedShapes = ['circle'],
        shape = {
          type: 'circle',
          coordinates: ['some coordinates'],
          radius: '10m'
        };

      checkStructureStub.returns(true);
      getDistanceStub.returns(10);
      GeoShapeType.__set__('isPoint', isPointStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, [])).be.true();
      should(isPointStub.callCount).be.eql(1);
    });

    it('should return true if circle is valid', () => {
      var
        isPointStub = sandbox.stub().returns(true),
        allowedShapes = ['circle'],
        shape = {
          type: 'circle',
          coordinates: ['some coordinates'],
          radius: 10
        };

      checkStructureStub.returns(true);
      GeoShapeType.__set__('isPoint', isPointStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, [])).be.true();
      should(isPointStub.callCount).be.eql(1);
    });

    it('should return true if all points of a multipoint is valid', () => {
      var
        isPointStub = sandbox.stub().returns(true),
        allowedShapes = ['multipoint'],
        shape = {
          type: 'multipoint',
          coordinates: ['some coordinates', 'some other coordinates']
        };

      checkStructureStub.returns(true);
      GeoShapeType.__set__('isPoint', isPointStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, [])).be.true();
      should(isPointStub.callCount).be.eql(2);
    });

    it('should return false if one point of a multipoint is not valid', () => {
      var
        isPointStub = sandbox.stub().returns(false),
        allowedShapes = ['multipoint'],
        shape = {
          type: 'multipoint',
          coordinates: ['some coordinates', 'some other coordinates']
        };

      checkStructureStub.returns(true);
      GeoShapeType.__set__('isPoint', isPointStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, [])).be.false();
      should(isPointStub.callCount).be.eql(1);
    });

    it('should return false if polygon has a bad "orientation" value', () => {
      var
        isPolygonStub = sandbox.stub().returns(true),
        errorMessages = [],
        allowedShapes = ['polygon'],
        shape = {
          type: 'polygon',
          coordinates: ['some coordinates'],
          orientation: 'bad orentation'
        };

      checkStructureStub.returns(true);
      GeoShapeType.__set__('isPolygon', isPolygonStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, errorMessages)).be.false();
      should(isPolygonStub.callCount).be.eql(1);
      should(errorMessages).be.deepEqual(['The orientation property has not a valid value.']);
    });

    it('should return false if geometrycollection is not valid', () => {
      var
        errorMessages = [],
        isPointStub = sandbox.stub().returns(false),
        allowedShapes = ['geometrycollection'],
        shape = {
          type: 'geometrycollection',
          geometries: [
            {
              type: 'point',
              coordinates: ['some coordinates']
            }
          ]
        };

      checkStructureStub.returns(true);
      GeoShapeType.__set__('isPoint', isPointStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, errorMessages)).be.false();
      should(isPointStub.callCount).be.eql(1);
      should(errorMessages).be.deepEqual(['The shape type "point" has bad coordinates.']);
    });

    it('should return false if the radius of circle is not valid', () => {
      var
        errorMessages = [],
        isPointStub = sandbox.stub().returns(true),
        allowedShapes = ['circle'],
        shape = {
          type: 'circle',
          coordinates: ['some coordinates'],
          radius: {not: 'valid'}
        };

      checkStructureStub.returns(true);
      GeoShapeType.__set__('isPoint', isPointStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, errorMessages)).be.false();
      should(isPointStub.callCount).be.eql(1);
      should(errorMessages).be.deepEqual(['The radius property has not a valid format.']);
    });

    it('should return false if the radius of circle is not valid', () => {
      var
        errorMessages = [],
        isPointStub = sandbox.stub().returns(true),
        allowedShapes = ['circle'],
        shape = {
          type: 'circle',
          coordinates: ['some coordinates'],
          radius: '10m'
        };

      checkStructureStub.returns(true);
      getDistanceStub.throws({message: 'an error'});
      GeoShapeType.__set__('isPoint', isPointStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, errorMessages)).be.false();
      should(isPointStub.callCount).be.eql(1);
      should(errorMessages).be.deepEqual(['The radius property has not a valid format.']);
    });

    it('should return false if the radius of circle is not valid', () => {
      var
        errorMessages = [],
        isPointStub = sandbox.stub().returns(true),
        allowedShapes = ['circle'],
        shape = {
          type: 'circle',
          coordinates: ['some coordinates'],
          radius: '10m'
        };

      checkStructureStub.returns(true);
      getDistanceStub.returns('a string');
      GeoShapeType.__set__('isPoint', isPointStub);

      should(geoShapeType.recursiveShapeValidation(allowedShapes, shape, errorMessages)).be.false();
      should(isPointStub.callCount).be.eql(1);
      should(errorMessages).be.deepEqual(['The radius property has not a valid format.']);
    });
  });

  describe('#checkStructure', () => {
    it('should return true if structure is valid', () => {
      var
        allowedShapes = ['allowed'],
        shape = {
          'type': 'allowed',
          coordinates: ['some coordinates']
        };

      should(geoShapeType.checkStructure(allowedShapes, shape, [])).be.true();
    });

    it('should return false has no defined type', () => {
      var
        errorMessages = [],
        allowedShapes = ['allowed'],
        shape = {
          coordinates: ['some coordinates']
        };

      should(geoShapeType.checkStructure(allowedShapes, shape, errorMessages)).be.false();
      should(errorMessages).be.deepEqual(['The shape object has no type defined.']);
    });

    it('should return false if the argument has not allowed properties', () => {
      var
        errorMessages = [],
        allowedShapes = ['allowed'],
        shape = {
          type: 'allowed',
          invalid: 'property',
          coordinates: ['some coordinates']
        };

      should(geoShapeType.checkStructure(allowedShapes, shape, errorMessages)).be.false();
      should(errorMessages).be.deepEqual(['The shape object has a not allowed property.']);
    });

    it('should return false if the type is not allowed', () => {
      var
        errorMessages = [],
        allowedShapes = ['allowed'],
        shape = {
          type: 'not_allowed',
          coordinates: ['some coordinates']
        };

      should(geoShapeType.checkStructure(allowedShapes, shape, errorMessages)).be.false();
      should(errorMessages).be.deepEqual(['The provided shape type is not allowed.']);
    });

    it('should return false if geometrycollection provides coordinates', () => {
      var
        errorMessages = [],
        allowedShapes = ['geometrycollection'],
        shape = {
          type: 'geometrycollection',
          coordinates: ['some coordinates'],
          geometries: ['some coordinates']
        };

      should(geoShapeType.checkStructure(allowedShapes, shape, errorMessages)).be.false();
      should(errorMessages).be.deepEqual(['The coordinates property must not be provided for the "geometrycollection" shape type.']);
    });

    it('should return false if "coordinates" property not valid', () => {
      var
        errorMessages = [],
        allowedShapes = ['allowed'],
        shape = {
          type: 'allowed',
          coordinates: 'not coordinates'
        };

      should(geoShapeType.checkStructure(allowedShapes, shape, errorMessages)).be.false();
      should(errorMessages).be.deepEqual(['The coordinates property must be provided for the "allowed" shape type.']);
    });

    it('should return false if a circle shape does not define a radius', () => {
      var
        errorMessages = [],
        allowedShapes = ['circle'],
        shape = {
          type: 'circle',
          coordinates: ['some coordinates']
        };

      should(geoShapeType.checkStructure(allowedShapes, shape, errorMessages)).be.false();
      should(errorMessages).be.deepEqual(['The radius property is mandatory for the "circle" shape type.']);
    });

    it('should return false if "radius" property is defined without beeing in a circle context', () => {
      var
        errorMessages = [],
        allowedShapes = ['allowed'],
        shape = {
          type: 'allowed',
          coordinates: ['some coordinates'],
          radius: 'some radius'
        };

      should(geoShapeType.checkStructure(allowedShapes, shape, errorMessages)).be.false();
      should(errorMessages).be.deepEqual([`The radius property must not be provided for the "${shape.type}" shape type.`]);
    });

    it('should return false if "orientation" property is defined without beeing in a polygon context', () => {
      var
        errorMessages = [],
        allowedShapes = ['allowed'],
        shape = {
          type: 'allowed',
          coordinates: ['some coordinates'],
          orientation: 'some orientation'
        };

      should(geoShapeType.checkStructure(allowedShapes, shape, errorMessages)).be.false();
      should(errorMessages).be.deepEqual([`The orientation property must not be provided for the "${shape.type}" shape type.`]);
    });

    it('should return false if "geometries" property is defined without beeing in a geometrycollection context', () => {
      var
        errorMessages = [],
        allowedShapes = ['allowed'],
        shape = {
          type: 'allowed',
          coordinates: ['some coordinates'],
          geometries: 'some geometries'
        };

      should(geoShapeType.checkStructure(allowedShapes, shape, errorMessages)).be.false();
      should(errorMessages).be.deepEqual([`The geometries property must not be provided for the "${shape.type}" shape type.`]);
    });

    it('should return false if "geometries" property is not defined properly within a geometrycollection context', () => {
      var
        errorMessages = [],
        allowedShapes = ['geometrycollection'],
        shape = {
          type: 'geometrycollection',
          geometries: 'not an array'
        };

      should(geoShapeType.checkStructure(allowedShapes, shape, errorMessages)).be.false();
      should(errorMessages).be.deepEqual(['The geometries property must be provided for the "geometrycollection" shape type.']);
    });
  });

  describe('#validateFieldSpecification', () => {
    it('should set the typeOptions to all shapes if shapeTypes is not defined', () => {
      var
        expectedTypeOptions = {
          shapeTypes: [
            'point', 'linestring', 'polygon', 'multipoint', 'multilinestring',
            'multipolygon', 'geometrycollection', 'envelope', 'circle'
          ]
        };

      should(geoShapeType.validateFieldSpecification({})).be.deepEqual(expectedTypeOptions);
    });

    it('should return the typeOptions if shapeTypes is provided and valid', () => {
      var typeOptions = {shapeTypes: ['point', 'linestring']};
      should(geoShapeType.validateFieldSpecification(typeOptions)).be.deepEqual(typeOptions);
    });

    it('should return false if one of the provided shapeTypes is not valid', () => {
      should(geoShapeType.validateFieldSpecification({shapeTypes: ['not valid']})).be.false();
    });

    it('should return false if the provided shapeTypes list is empty', () => {
      should(geoShapeType.validateFieldSpecification({shapeTypes: []})).be.false();
    });
  });

  describe('#isPoint', () => {
    it('should return true if the argument is a point', () => {
      var
        point = [10, 20];

      should(GeoShapeType.__get__('isPoint')(point)).be.true();
    });

    it('should return false if the argument is not an array', () => {
      var
        point = 'not a point';

      should(GeoShapeType.__get__('isPoint')(point)).be.false();
    });

    it('should return false if the argument has not 2 elements', () => {
      var
        point = [10];

      should(GeoShapeType.__get__('isPoint')(point)).be.false();
    });

    it('should return false if the point is out of boundaries', () => {
      var
        point = [190, 20];

      should(GeoShapeType.__get__('isPoint')(point)).be.false();
    });

    it('should return false if the point is out of boundaries', () => {
      var
        point = [20, 100];

      should(GeoShapeType.__get__('isPoint')(point)).be.false();
    });
  });

  describe('#isPointEqual', () => {
    it('should return true if the points are equal', () => {
      var
        pointA = [10, 20],
        pointB = [10, 20];

      should(GeoShapeType.__get__('isPointEqual')(pointA, pointB)).be.true();
    });

    it('should return false if the points are not equal', () => {
      var
        pointA = [10, 20],
        pointB = [20, 30];

      should(GeoShapeType.__get__('isPointEqual')(pointA, pointB)).be.false();
    });
  });

  describe('#isLine', () => {
    var
      isPointStub = sandbox.stub();

    it('should return true if the argument has the expected format', () => {
      var line = ['one', 'two'];

      isPointStub.returns(true);
      GeoShapeType.__set__('isPoint', isPointStub);

      should(GeoShapeType.__get__('isLine')(line)).be.true();
      should(isPointStub.callCount).be.eql(2);
    });

    it('should return false if the argument has not at least 2 elements', () => {
      var line = ['one'];

      should(GeoShapeType.__get__('isLine')(line)).be.false();
    });

    it('should return false if one of the element is not a point', () => {
      var line = ['one', 'two'];

      isPointStub.returns(false);
      GeoShapeType.__set__('isPoint', isPointStub);

      should(GeoShapeType.__get__('isLine')(line)).be.false();
      should(isPointStub.callCount).be.eql(1);
    });
  });

  describe('#isPolygonPart', () => {
    var
      isLineStub = sandbox.stub(),
      isPointEqualStub = sandbox.stub();

    it('should return true if the argument has the expected format', () => {
      var polygonPart = ['one', 'two', 'three', 'four'];

      isLineStub.returns(true);
      isPointEqualStub.returns(true);
      GeoShapeType.__set__('isLine', isLineStub);
      GeoShapeType.__set__('isPointEqual', isPointEqualStub);

      should(GeoShapeType.__get__('isPolygonPart')(polygonPart)).be.true();
      should(isLineStub.callCount).be.eql(1);
      should(isPointEqualStub.callCount).be.eql(1);
    });

    it('should return false if the argument is not an array', () => {
      var polygonPart = 'not an array';

      should(GeoShapeType.__get__('isPolygonPart')(polygonPart)).be.false();
    });

    it('should return false if the argument is not a line', () => {
      var polygonPart = ['one', 'two', 'three', 'four'];

      isLineStub.returns(false);
      GeoShapeType.__set__('isLine', isLineStub);

      should(GeoShapeType.__get__('isPolygonPart')(polygonPart)).be.false();
      should(isLineStub.callCount).be.eql(1);
    });

    it('should return false if the argument has not its first and last point equal', () => {
      var polygonPart = ['one', 'two', 'three', 'four'];

      isLineStub.returns(true);
      isPointEqualStub.returns(false);
      GeoShapeType.__set__('isLine', isLineStub);
      GeoShapeType.__set__('isPointEqual', isPointEqualStub);

      should(GeoShapeType.__get__('isPolygonPart')(polygonPart)).be.false();
      should(isLineStub.callCount).be.eql(1);
      should(isPointEqualStub.callCount).be.eql(1);
    });

    it('should return false if the argument has not at least 4 elements', () => {
      var polygonPart = ['one', 'two', 'three'];

      should(GeoShapeType.__get__('isPolygonPart')(polygonPart)).be.false();
    });
  });

  describe('#isPolygon', () => {
    var
      isPolygonPartStub = sandbox.stub();

    it('should return true if the argument has the expected format', () => {
      var polygon = ['one', 'two', 'three'];

      isPolygonPartStub.returns(true);
      GeoShapeType.__set__('isPolygonPart', isPolygonPartStub);

      should(GeoShapeType.__get__('isPolygon')(polygon)).be.true();
      should(isPolygonPartStub.callCount).be.eql(3);
    });

    it('should return false if one of the element is not a polygon part', () => {
      var polygon = ['one', 'two', 'three'];

      isPolygonPartStub.returns(false);
      GeoShapeType.__set__('isPolygonPart', isPolygonPartStub);

      should(GeoShapeType.__get__('isPolygon')(polygon)).be.false();
      should(isPolygonPartStub.callCount).be.eql(1);
    });

    it('should return false if the argument is not an array', () => {
      var polygon = 'not an array';

      GeoShapeType.__set__('isPolygonPart', isPolygonPartStub);

      should(GeoShapeType.__get__('isPolygon')(polygon)).be.false();
      should(isPolygonPartStub.callCount).be.eql(0);
    });
  });

  describe('#isEnvelope', () => {
    var
      isPointStub = sandbox.stub();

    it('should return true if the argument has the expected format', () => {
      var envelope = ['one', 'two'];

      isPointStub.returns(true);
      GeoShapeType.__set__('isPoint', isPointStub);

      should(GeoShapeType.__get__('isEnvelope')(envelope)).be.true();
      should(isPointStub.callCount).be.eql(2);
    });

    it('should return false if one of the element is not a point', () => {
      var envelope = ['one', 'two'];

      isPointStub.returns(false);
      GeoShapeType.__set__('isPoint', isPointStub);

      should(GeoShapeType.__get__('isEnvelope')(envelope)).be.false();
      should(isPointStub.callCount).be.eql(1);
    });

    it('should return false if there is not 2 elements in the argument array', () => {
      var envelope = ['one'];

      GeoShapeType.__set__('isPoint', isPointStub);

      should(GeoShapeType.__get__('isEnvelope')(envelope)).be.false();
      should(isPointStub.callCount).be.eql(0);
    });
  });
});