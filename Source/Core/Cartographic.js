define([
        './Cartesian3',
        './Check',
        './defaultValue',
        './defined',
        './freezeObject',
        './Math',
        './scaleToGeodeticSurface'
    ], function(
        Cartesian3,
        Check,
        defaultValue,
        defined,
        freezeObject,
        CesiumMath,
        scaleToGeodeticSurface) {
    'use strict';

    /**
     * A position defined by longitude, latitude, and height.
     * @alias Cartographic
     * @constructor
     *
     * @param {Number} [longitude=0.0] The longitude, in radians.
     * @param {Number} [latitude=0.0] The latitude, in radians.
     * @param {Number} [height=0.0] The height, in meters, above the ellipsoid.
     *
     * @see Ellipsoid
     */
    // 仔细看了一下 Cartographic 这个类，其通用的经纬度都是用弧度标注的。无论输入是角度还是弧度，最终都会转换为弧度。
    // 因此我推断这是在程序中一个通用的坐标系，即开发者只要使用这个类进行坐标系的表达就不用担心弧度角度的不同和转换问题。
    // 这个类的所有方法包括构造方法都是以弧度为标准表达和输出的。
    // 我想这也是 Cartographic 和 Cartesian 之间的区别吧
    function Cartographic(longitude, latitude, height) {
        /**
         * The longitude, in radians.
         * @type {Number}
         * @default 0.0
         */
        this.longitude = defaultValue(longitude, 0.0);

        /**
         * The latitude, in radians.
         * @type {Number}
         * @default 0.0
         */
        this.latitude = defaultValue(latitude, 0.0);

        /**
         * The height, in meters, above the ellipsoid.
         * @type {Number}
         * @default 0.0
         */
        this.height = defaultValue(height, 0.0);
    }

    /**
     * Creates a new Cartographic instance from longitude and latitude
     * specified in radians.
     *
     * @param {Number} longitude The longitude, in radians.
     * @param {Number} latitude The latitude, in radians.
     * @param {Number} [height=0.0] The height, in meters, above the ellipsoid.
     * @param {Cartographic} [result] The object onto which to store the result.
     * @returns {Cartographic} The modified result parameter or a new Cartographic instance if one was not provided.
     */
    // 和 Cartesian 类中的 fromRadians 不同的是 Cartesian 的同名方法将弧度转化为角度并返回
    // 而 Cartographic 类中的这个方法则直接使用输入的弧度值进行输出
    Cartographic.fromRadians = function(longitude, latitude, height, result) {
        //>>includeStart('debug', pragmas.debug);
        Check.typeOf.number('longitude', longitude);
        Check.typeOf.number('latitude', latitude);
        //>>includeEnd('debug');

        height = defaultValue(height, 0.0);

        if (!defined(result)) {
            return new Cartographic(longitude, latitude, height);
        }

        result.longitude = longitude;
        result.latitude = latitude;
        result.height = height;
        return result;
    };

    /**
     * Creates a new Cartographic instance from longitude and latitude
     * specified in degrees.  The values in the resulting object will
     * be in radians.
     *
     * @param {Number} longitude The longitude, in degrees.
     * @param {Number} latitude The latitude, in degrees.
     * @param {Number} [height=0.0] The height, in meters, above the ellipsoid.
     * @param {Cartographic} [result] The object onto which to store the result.
     * @returns {Cartographic} The modified result parameter or a new Cartographic instance if one was not provided.
     */
    // 这个方法是将输入的角度值 （经度和纬度）转换为弧度然后进行输出
    Cartographic.fromDegrees = function(longitude, latitude, height, result) {
        //>>includeStart('debug', pragmas.debug);
        Check.typeOf.number('longitude', longitude);
        Check.typeOf.number('latitude', latitude);
        //>>includeEnd('debug');
        longitude = CesiumMath.toRadians(longitude);
        latitude = CesiumMath.toRadians(latitude);

        return Cartographic.fromRadians(longitude, latitude, height, result);
    };

    var cartesianToCartographicN = new Cartesian3();
    var cartesianToCartographicP = new Cartesian3();
    var cartesianToCartographicH = new Cartesian3();
    var wgs84OneOverRadii = new Cartesian3(1.0 / 6378137.0, 1.0 / 6378137.0, 1.0 / 6356752.3142451793);
    var wgs84OneOverRadiiSquared = new Cartesian3(1.0 / (6378137.0 * 6378137.0), 1.0 / (6378137.0 * 6378137.0), 1.0 / (6356752.3142451793 * 6356752.3142451793));
    var wgs84CenterToleranceSquared = CesiumMath.EPSILON1;

    /**
     * Creates a new Cartographic instance from a Cartesian position. The values in the
     * resulting object will be in radians.
     *
     * @param {Cartesian3} cartesian The Cartesian position to convert to cartographic representation.
     * @param {Ellipsoid} [ellipsoid=Ellipsoid.WGS84] The ellipsoid on which the position lies.
     * @param {Cartographic} [result] The object onto which to store the result.
     * @returns {Cartographic} The modified result parameter, new Cartographic instance if none was provided, or undefined if the cartesian is at the center of the ellipsoid.
     */
    // 同样是将 Cartesian 的坐标进行转换变成同意的弧度表达并输出
    Cartographic.fromCartesian = function(cartesian, ellipsoid, result) {
        var oneOverRadii = defined(ellipsoid) ? ellipsoid.oneOverRadii : wgs84OneOverRadii;
        var oneOverRadiiSquared = defined(ellipsoid) ? ellipsoid.oneOverRadiiSquared : wgs84OneOverRadiiSquared;
        var centerToleranceSquared = defined(ellipsoid) ? ellipsoid._centerToleranceSquared : wgs84CenterToleranceSquared;

        //`cartesian is required.` is thrown from scaleToGeodeticSurface
        var p = scaleToGeodeticSurface(cartesian, oneOverRadii, oneOverRadiiSquared, centerToleranceSquared, cartesianToCartographicP);

        if (!defined(p)) {
            return undefined;
        }

        var n = Cartesian3.multiplyComponents(p, oneOverRadiiSquared, cartesianToCartographicN);
        n = Cartesian3.normalize(n, n);

        var h = Cartesian3.subtract(cartesian, p, cartesianToCartographicH);

        var longitude = Math.atan2(n.y, n.x);
        var latitude = Math.asin(n.z);
        var height = CesiumMath.sign(Cartesian3.dot(h, cartesian)) * Cartesian3.magnitude(h);

        if (!defined(result)) {
            return new Cartographic(longitude, latitude, height);
        }
        result.longitude = longitude;
        result.latitude = latitude;
        result.height = height;
        return result;
    };

    /**
     * Creates a new Cartesian3 instance from a Cartographic input. The values in the inputted
     * object should be in radians.
     *
     * @param {Cartographic} cartographic Input to be converted into a Cartesian3 output.
     * @param {Ellipsoid} [ellipsoid=Ellipsoid.WGS84] The ellipsoid on which the position lies.
     * @param {Cartesian3} [result] The object onto which to store the result.
     * @returns {Cartesian3} The position
     */
    // 将弧度坐标转化为 Cartesian3 支持的角度坐标
    // 这里还调用了 Cartesian3 的一个方法，如果 .fromeRadians() 是从弧度转角度的话
    // 因为这个调用的方法源代码我也没看懂
    Cartographic.toCartesian = function(cartographic, ellipsoid, result) {
        //>>includeStart('debug', pragmas.debug);
        Check.defined('cartographic', cartographic);
        //>>includeEnd('debug');

        return Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, cartographic.height, ellipsoid, result);
    };

    /**
     * Duplicates a Cartographic instance.
     *
     * @param {Cartographic} cartographic The cartographic to duplicate.
     * @param {Cartographic} [result] The object onto which to store the result.
     * @returns {Cartographic} The modified result parameter or a new Cartographic instance if one was not provided. (Returns undefined if cartographic is undefined)
     */
    Cartographic.clone = function(cartographic, result) {
        if (!defined(cartographic)) {
            return undefined;
        }
        if (!defined(result)) {
            return new Cartographic(cartographic.longitude, cartographic.latitude, cartographic.height);
        }
        result.longitude = cartographic.longitude;
        result.latitude = cartographic.latitude;
        result.height = cartographic.height;
        return result;
    };

    /**
     * Compares the provided cartographics componentwise and returns
     * <code>true</code> if they are equal, <code>false</code> otherwise.
     *
     * @param {Cartographic} [left] The first cartographic.
     * @param {Cartographic} [right] The second cartographic.
     * @returns {Boolean} <code>true</code> if left and right are equal, <code>false</code> otherwise.
     */
    Cartographic.equals = function(left, right) {
        return (left === right) ||
                ((defined(left)) &&
                 (defined(right)) &&
                 (left.longitude === right.longitude) &&
                 (left.latitude === right.latitude) &&
                 (left.height === right.height));
    };

    /**
     * Compares the provided cartographics componentwise and returns
     * <code>true</code> if they are within the provided epsilon,
     * <code>false</code> otherwise.
     *
     * @param {Cartographic} [left] The first cartographic.
     * @param {Cartographic} [right] The second cartographic.
     * @param {Number} epsilon The epsilon to use for equality testing.
     * @returns {Boolean} <code>true</code> if left and right are within the provided epsilon, <code>false</code> otherwise.
     */
    Cartographic.equalsEpsilon = function(left, right, epsilon) {
        //>>includeStart('debug', pragmas.debug);
        Check.typeOf.number('epsilon', epsilon);
        //>>includeEnd('debug');

        return (left === right) ||
               ((defined(left)) &&
                (defined(right)) &&
                (Math.abs(left.longitude - right.longitude) <= epsilon) &&
                (Math.abs(left.latitude - right.latitude) <= epsilon) &&
                (Math.abs(left.height - right.height) <= epsilon));
    };

    /**
     * An immutable Cartographic instance initialized to (0.0, 0.0, 0.0).
     *
     * @type {Cartographic}
     * @constant
     */
    Cartographic.ZERO = freezeObject(new Cartographic(0.0, 0.0, 0.0));

    /**
     * Duplicates this instance.
     *
     * @param {Cartographic} [result] The object onto which to store the result.
     * @returns {Cartographic} The modified result parameter or a new Cartographic instance if one was not provided.
     */
    Cartographic.prototype.clone = function(result) {
        return Cartographic.clone(this, result);
    };

    /**
     * Compares the provided against this cartographic componentwise and returns
     * <code>true</code> if they are equal, <code>false</code> otherwise.
     *
     * @param {Cartographic} [right] The second cartographic.
     * @returns {Boolean} <code>true</code> if left and right are equal, <code>false</code> otherwise.
     */
    Cartographic.prototype.equals = function(right) {
        return Cartographic.equals(this, right);
    };

    /**
     * Compares the provided against this cartographic componentwise and returns
     * <code>true</code> if they are within the provided epsilon,
     * <code>false</code> otherwise.
     *
     * @param {Cartographic} [right] The second cartographic.
     * @param {Number} epsilon The epsilon to use for equality testing.
     * @returns {Boolean} <code>true</code> if left and right are within the provided epsilon, <code>false</code> otherwise.
     */
    Cartographic.prototype.equalsEpsilon = function(right, epsilon) {
        return Cartographic.equalsEpsilon(this, right, epsilon);
    };

    /**
     * Creates a string representing this cartographic in the format '(longitude, latitude, height)'.
     *
     * @returns {String} A string representing the provided cartographic in the format '(longitude, latitude, height)'.
     */
    Cartographic.prototype.toString = function() {
        return '(' + this.longitude + ', ' + this.latitude + ', ' + this.height + ')';
    };

    return Cartographic;
});
