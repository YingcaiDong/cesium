define([
        './Cartesian3',
        './Cartographic',
        './defaultValue',
        './defined',
        './defineProperties',
        './DeveloperError',
        './Ellipsoid'
    ], function(
        Cartesian3,
        Cartographic,
        defaultValue,
        defined,
        defineProperties,
        DeveloperError,
        Ellipsoid) {
    'use strict';

    /**
     * A simple map projection where longitude and latitude are linearly mapped to X and Y by multiplying
     * them by the {@link Ellipsoid#maximumRadius}.  This projection
     * is commonly known as geographic, equirectangular, equidistant cylindrical, or plate carrée.  It
     * is also known as EPSG:4326.
     *
     * @alias GeographicProjection
     * @constructor
     *
     * @param {Ellipsoid} [ellipsoid=Ellipsoid.WGS84] The ellipsoid.
     *
     * @see WebMercatorProjection
     */
    function GeographicProjection(ellipsoid) {
        // 选择需要映射的球体，一般来说都是Cesium.Viewer.glob.ellipsoid.
        this._ellipsoid = defaultValue(ellipsoid, Ellipsoid.WGS84);
        // 得到球体的最大半径
        this._semimajorAxis = this._ellipsoid.maximumRadius;
        // 得到半径分之1
        this._oneOverSemimajorAxis = 1.0 / this._semimajorAxis;
    }

    defineProperties(GeographicProjection.prototype, {
        /**
         * Gets the {@link Ellipsoid}.
         *
         * @memberof GeographicProjection.prototype
         *
         * @type {Ellipsoid}
         * @readonly
         */
        ellipsoid : {
            get : function() {
                return this._ellipsoid;
            }
        }
    });

    /**
     * Projects a set of {@link Cartographic} coordinates, in radians, to map coordinates, in meters.
     * X and Y are the longitude and latitude, respectively, multiplied by the maximum radius of the
     * ellipsoid.  Z is the unmodified height.
     *
     * @param {Cartographic} cartographic The coordinates to project.
     * @param {Cartesian3} [result] An instance into which to copy the result.  If this parameter is
     *        undefined, a new instance is created and returned.
     * @returns {Cartesian3} The projected coordinates.  If the result parameter is not undefined, the
     *          coordinates are copied there and that instance is returned.  Otherwise, a new instance is
     *          created and returned.
     */
    // 映射的方法
    GeographicProjection.prototype.project = function(cartographic, result) {
        // Actually this is the special case of equidistant cylindrical called the plate carree
        // 得到之前赋值的球体最大半径
        var semimajorAxis = this._semimajorAxis;
        // 这里就是具体的映射过程了。也很直白。
        // 就是把需要转换的的坐标Cartographic.x/y 乘以最大半径即可
        var x = cartographic.longitude * semimajorAxis;
        var y = cartographic.latitude * semimajorAxis;
        // 高度保持不变
        var z = cartographic.height;

        if (!defined(result)) {
            return new Cartesian3(x, y, z);
        }

        result.x = x;
        result.y = y;
        result.z = z;
        return result;
    };

    /**
     * Unprojects a set of projected {@link Cartesian3} coordinates, in meters, to {@link Cartographic}
     * coordinates, in radians.  Longitude and Latitude are the X and Y coordinates, respectively,
     * divided by the maximum radius of the ellipsoid.  Height is the unmodified Z coordinate.
     *
     * @param {Cartesian3} cartesian The Cartesian position to unproject with height (z) in meters.
     * @param {Cartographic} [result] An instance into which to copy the result.  If this parameter is
     *        undefined, a new instance is created and returned.
     * @returns {Cartographic} The unprojected coordinates.  If the result parameter is not undefined, the
     *          coordinates are copied there and that instance is returned.  Otherwise, a new instance is
     *          created and returned.
     */
    // 反映射的方法
    GeographicProjection.prototype.unproject = function(cartesian, result) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(cartesian)) {
            throw new DeveloperError('cartesian is required');
        }
        //>>includeEnd('debug');

        var oneOverEarthSemimajorAxis = this._oneOverSemimajorAxis;
        // 反映射的做法也很直白，就是把上面映射的过程反过来
        // 因为之前映射是 x, y 坐标乘以最大半径
        // 因此现在就都除以最大半径就搞定了。
        var longitude = cartesian.x * oneOverEarthSemimajorAxis;
        var latitude = cartesian.y * oneOverEarthSemimajorAxis;
        // 同样的，高度保持不变。
        var height = cartesian.z;

        if (!defined(result)) {
            return new Cartographic(longitude, latitude, height);
        }

        result.longitude = longitude;
        result.latitude = latitude;
        result.height = height;
        return result;
    };

    return GeographicProjection;
});
