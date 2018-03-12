define([
        './Cartesian2',
        './defaultValue',
        './defined',
        './defineProperties',
        './Ellipsoid',
        './Rectangle',
        './WebMercatorProjection'
    ], function(
        Cartesian2,
        defaultValue,
        defined,
        defineProperties,
        Ellipsoid,
        Rectangle,
        WebMercatorProjection) {
    'use strict';

    /**
     * A tiling scheme for geometry referenced to a {@link WebMercatorProjection}, EPSG:3857.  This is
     * the tiling scheme used by Google Maps, Microsoft Bing Maps, and most of ESRI ArcGIS Online.
     *
     * @alias WebMercatorTilingScheme
     * @constructor
     *
     * @param {Object} [options] Object with the following properties:
     * @param {Ellipsoid} [options.ellipsoid=Ellipsoid.WGS84] The ellipsoid whose surface is being tiled. Defaults to
     * the WGS84 ellipsoid.
     * @param {Number} [options.numberOfLevelZeroTilesX=1] The number of tiles in the X direction at level zero of
     *        the tile tree.
     * @param {Number} [options.numberOfLevelZeroTilesY=1] The number of tiles in the Y direction at level zero of
     *        the tile tree.
     * @param {Cartesian2} [options.rectangleSouthwestInMeters] The southwest corner of the rectangle covered by the
     *        tiling scheme, in meters.  If this parameter or rectangleNortheastInMeters is not specified, the entire
     *        globe is covered in the longitude direction and an equal distance is covered in the latitude
     *        direction, resulting in a square projection.
     * @param {Cartesian2} [options.rectangleNortheastInMeters] The northeast corner of the rectangle covered by the
     *        tiling scheme, in meters.  If this parameter or rectangleSouthwestInMeters is not specified, the entire
     *        globe is covered in the longitude direction and an equal distance is covered in the latitude
     *        direction, resulting in a square projection.
     */
    function WebMercatorTilingScheme(options) {
        options = defaultValue(options, {});

        this._ellipsoid = defaultValue(options.ellipsoid, Ellipsoid.WGS84);
        this._numberOfLevelZeroTilesX = defaultValue(options.numberOfLevelZeroTilesX, 1);
        this._numberOfLevelZeroTilesY = defaultValue(options.numberOfLevelZeroTilesY, 1);

        this._projection = new WebMercatorProjection(this._ellipsoid);

        if (defined(options.rectangleSouthwestInMeters) &&
            defined(options.rectangleNortheastInMeters)) {
            this._rectangleSouthwestInMeters = options.rectangleSouthwestInMeters;
            this._rectangleNortheastInMeters = options.rectangleNortheastInMeters;
        } else {
            // 这里默认设置是球体周长的一半
            var semimajorAxisTimesPi = this._ellipsoid.maximumRadius * Math.PI;
            this._rectangleSouthwestInMeters = new Cartesian2(-semimajorAxisTimesPi, -semimajorAxisTimesPi);
            this._rectangleNortheastInMeters = new Cartesian2(semimajorAxisTimesPi, semimajorAxisTimesPi);
        }

        // 假设半径是12，那么_rectangleSouthwestInMeters 就是（-12*PI,-12*PI）
        // 而_rectangleNortheastInMeters 就是（12*PI, 12*PI）
        // 转换后的 southwest 就是（-PI, -PI/2）分别是long 和 lat
        // northeast 就是（PI, PI/2)
        var southwest = this._projection.unproject(this._rectangleSouthwestInMeters);
        var northeast = this._projection.unproject(this._rectangleNortheastInMeters);
        this._rectangle = new Rectangle(southwest.longitude, southwest.latitude,
                                  northeast.longitude, northeast.latitude);
    }

    defineProperties(WebMercatorTilingScheme.prototype, {
        /**
         * Gets the ellipsoid that is tiled by this tiling scheme.
         * @memberof WebMercatorTilingScheme.prototype
         * @type {Ellipsoid}
         */
        ellipsoid : {
            get : function() {
                return this._ellipsoid;
            }
        },

        /**
         * Gets the rectangle, in radians, covered by this tiling scheme.
         * @memberof WebMercatorTilingScheme.prototype
         * @type {Rectangle}
         */
        rectangle : {
            get : function() {
                return this._rectangle;
            }
        },

        /**
         * Gets the map projection used by this tiling scheme.
         * @memberof WebMercatorTilingScheme.prototype
         * @type {MapProjection}
         */
        projection : {
            get : function() {
                return this._projection;
            }
        }
    });

    /**
     * Gets the total number of tiles in the X direction at a specified level-of-detail.
     *
     * @param {Number} level The level-of-detail.
     * @returns {Number} The number of tiles in the X direction at the given level.
     */
    //bitwise 左移，相当于2的几次方
    WebMercatorTilingScheme.prototype.getNumberOfXTilesAtLevel = function(level) {
        return this._numberOfLevelZeroTilesX << level;
    };

    /**
     * Gets the total number of tiles in the Y direction at a specified level-of-detail.
     *
     * @param {Number} level The level-of-detail.
     * @returns {Number} The number of tiles in the Y direction at the given level.
     */
    WebMercatorTilingScheme.prototype.getNumberOfYTilesAtLevel = function(level) {
        return this._numberOfLevelZeroTilesY << level;
    };

    /**
     * Transforms a rectangle specified in geodetic radians to the native coordinate system
     * of this tiling scheme.
     *
     * @param {Rectangle} rectangle The rectangle to transform.
     * @param {Rectangle} [result] The instance to which to copy the result, or undefined if a new instance
     *        should be created.
     * @returns {Rectangle} The specified 'result', or a new object containing the native rectangle if 'result'
     *          is undefined.
     */
    WebMercatorTilingScheme.prototype.rectangleToNativeRectangle = function(rectangle, result) {
        // 这里的projection是WebMercatorProjection，在就开始定义的
        var projection = this._projection;
        var southwest = projection.project(Rectangle.southwest(rectangle));
        var northeast = projection.project(Rectangle.northeast(rectangle));

        if (!defined(result)) {
            return new Rectangle(southwest.x, southwest.y, northeast.x, northeast.y);
        }

        result.west = southwest.x;
        result.south = southwest.y;
        result.east = northeast.x;
        result.north = northeast.y;
        return result;
    };

    /**
     * Converts tile x, y coordinates and level to a rectangle expressed in the native coordinates
     * of the tiling scheme.
     *
     * @param {Number} x The integer x coordinate of the tile.
     * @param {Number} y The integer y coordinate of the tile.
     * @param {Number} level The tile level-of-detail.  Zero is the least detailed.
     * @param {Object} [result] The instance to which to copy the result, or undefined if a new instance
     *        should be created.
     * @returns {Rectangle} The specified 'result', or a new object containing the rectangle
     *          if 'result' is undefined.
     */
    // 这里的 x 和 y 都应该是瓦片阵列的 index 值，就像一个 matrix 中每一个元素的坐标一样
    WebMercatorTilingScheme.prototype.tileXYToNativeRectangle = function(x, y, level, result) {
        // 输入level，得到x和y方向的瓦片数量
        var xTiles = this.getNumberOfXTilesAtLevel(level);
        var yTiles = this.getNumberOfYTilesAtLevel(level);

        // 每一片瓦片的宽度等于总宽度除以总数量
        var xTileWidth = (this._rectangleNortheastInMeters.x - this._rectangleSouthwestInMeters.x) / xTiles;
        // west 和 east 这里指每个瓦片的左边缘和右边缘的坐标
        var west = this._rectangleSouthwestInMeters.x + x * xTileWidth;
        var east = this._rectangleSouthwestInMeters.x + (x + 1) * xTileWidth;

        // 每篇瓦片的高度等于总宽度除以总数量
        var yTileHeight = (this._rectangleNortheastInMeters.y - this._rectangleSouthwestInMeters.y) / yTiles;
        // north 和 south 分别代表每一个瓦片的上边缘和下边缘的坐标
        var north = this._rectangleNortheastInMeters.y - y * yTileHeight;
        var south = this._rectangleNortheastInMeters.y - (y + 1) * yTileHeight;

        if (!defined(result)) {
            return new Rectangle(west, south, east, north);
        }

        // 返回请求瓦片的具体地理坐标值
        result.west = west;
        result.south = south;
        result.east = east;
        result.north = north;
        return result;
    };

    /**
     * Converts tile x, y coordinates and level to a cartographic rectangle in radians.
     *
     * @param {Number} x The integer x coordinate of the tile.
     * @param {Number} y The integer y coordinate of the tile.
     * @param {Number} level The tile level-of-detail.  Zero is the least detailed.
     * @param {Object} [result] The instance to which to copy the result, or undefined if a new instance
     *        should be created.
     * @returns {Rectangle} The specified 'result', or a new object containing the rectangle
     *          if 'result' is undefined.
     */
    // 基于 nativeRectangle 方法的另外一种转换
    WebMercatorTilingScheme.prototype.tileXYToRectangle = function(x, y, level, result) {
        var nativeRectangle = this.tileXYToNativeRectangle(x, y, level, result);

        var projection = this._projection;
        var southwest = projection.unproject(new Cartesian2(nativeRectangle.west, nativeRectangle.south));
        var northeast = projection.unproject(new Cartesian2(nativeRectangle.east, nativeRectangle.north));

        nativeRectangle.west = southwest.longitude;
        nativeRectangle.south = southwest.latitude;
        nativeRectangle.east = northeast.longitude;
        nativeRectangle.north = northeast.latitude;
        return nativeRectangle;
    };

    /**
     * Calculates the tile x, y coordinates of the tile containing
     * a given cartographic position.
     *
     * @param {Cartographic} position The position.
     * @param {Number} level The tile level-of-detail.  Zero is the least detailed.
     * @param {Cartesian2} [result] The instance to which to copy the result, or undefined if a new instance
     *        should be created.
     * @returns {Cartesian2} The specified 'result', or a new object containing the tile x, y coordinates
     *          if 'result' is undefined.
     */
    // 这是一个通过单点地理坐标转换成瓦片矩阵中index值的方法。
    WebMercatorTilingScheme.prototype.positionToTileXY = function(position, level, result) {
        var rectangle = this._rectangle;
        if (!Rectangle.contains(rectangle, position)) {
            // outside the bounds of the tiling scheme
            return undefined;
        }

        // 得到当先高度下的 x方向瓦片 和 y方向瓦片 的数量
        var xTiles = this.getNumberOfXTilesAtLevel(level);
        var yTiles = this.getNumberOfYTilesAtLevel(level);

        // 求总宽度
        var overallWidth = this._rectangleNortheastInMeters.x - this._rectangleSouthwestInMeters.x;
        // 求单个瓦片宽度 = 总宽/个数
        var xTileWidth = overallWidth / xTiles;
        // 求总长度
        var overallHeight = this._rectangleNortheastInMeters.y - this._rectangleSouthwestInMeters.y;
        // 求单个瓦片的高度
        var yTileHeight = overallHeight / yTiles;

        // 这里的projection是WebMercatorProjection，在就开始定义的
        var projection = this._projection;

        // 先转换坐标系
        var webMercatorPosition = projection.project(position);
        // 得到输入坐标距离矩形左侧边缘的距离
        var distanceFromWest = webMercatorPosition.x - this._rectangleSouthwestInMeters.x;
        // 得到输入坐标距离矩形上边缘的距离
        var distanceFromNorth = this._rectangleNortheastInMeters.y - webMercatorPosition.y;

        // 得到瓦片在当前瓦片矩阵中的col（即纵列）的index值
        var xTileCoordinate = distanceFromWest / xTileWidth | 0;
        // 如果这个index值大于或等于x方向（即横向）的瓦片总量
        if (xTileCoordinate >= xTiles) {
            // 默认变成横向最末一个瓦片的index
            xTileCoordinate = xTiles - 1;
        }
        
        // 同理得到当前瓦片矩阵中row（即横列）的index值
        var yTileCoordinate = distanceFromNorth / yTileHeight | 0;
        if (yTileCoordinate >= yTiles) {
            yTileCoordinate = yTiles - 1;
        }

        if (!defined(result)) {
            return new Cartesian2(xTileCoordinate, yTileCoordinate);
        }

        result.x = xTileCoordinate;
        result.y = yTileCoordinate;
        return result;
    };

    return WebMercatorTilingScheme;
});
