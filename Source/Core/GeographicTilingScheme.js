define([
        './Cartesian2',
        './Check',
        './defaultValue',
        './defined',
        './defineProperties',
        './Ellipsoid',
        './GeographicProjection',
        './Math',
        './Rectangle'
    ], function(
        Cartesian2,
        Check,
        defaultValue,
        defined,
        defineProperties,
        Ellipsoid,
        GeographicProjection,
        CesiumMath,
        Rectangle) {
    'use strict';

    /**
     * A tiling scheme for geometry referenced to a simple {@link GeographicProjection} where
     * longitude and latitude are directly mapped to X and Y.  This projection is commonly
     * known as geographic, equirectangular, equidistant cylindrical, or plate carrée.
     *
     * @alias GeographicTilingScheme
     * @constructor
     *
     * @param {Object} [options] Object with the following properties:
     * @param {Ellipsoid} [options.ellipsoid=Ellipsoid.WGS84] The ellipsoid whose surface is being tiled. Defaults to
     * the WGS84 ellipsoid.
     * @param {Rectangle} [options.rectangle=Rectangle.MAX_VALUE] The rectangle, in radians, covered by the tiling scheme.
     * @param {Number} [options.numberOfLevelZeroTilesX=2] The number of tiles in the X direction at level zero of
     * the tile tree.
     * @param {Number} [options.numberOfLevelZeroTilesY=1] The number of tiles in the Y direction at level zero of
     * the tile tree.
     */
    function GeographicTilingScheme(options) {
        options = defaultValue(options, {});

        // 得到当前观测球体，通常来说就是 Cesium.Viewer.glob.ellipsoid.
        this._ellipsoid = defaultValue(options.ellipsoid, Ellipsoid.WGS84);
        // 这里的矩形应该是贴片矩阵所形成的矩形，对应的是不同 z-level 而不同
        this._rectangle = defaultValue(options.rectangle, Rectangle.MAX_VALUE);
        // geographic 映射很直白，x和y坐标都乘以最大半径，z保持不变
        this._projection = new GeographicProjection(this._ellipsoid);
        // 在 z-level = 0 的时候的 横向和纵向的瓦片数量
        this._numberOfLevelZeroTilesX = defaultValue(options.numberOfLevelZeroTilesX, 2);
        this._numberOfLevelZeroTilesY = defaultValue(options.numberOfLevelZeroTilesY, 1);
    }

    defineProperties(GeographicTilingScheme.prototype, {
        /**
         * Gets the ellipsoid that is tiled by this tiling scheme.
         * @memberof GeographicTilingScheme.prototype
         * @type {Ellipsoid}
         */
        ellipsoid : {
            get : function() {
                return this._ellipsoid;
            }
        },

        /**
         * Gets the rectangle, in radians, covered by this tiling scheme.
         * @memberof GeographicTilingScheme.prototype
         * @type {Rectangle}
         */
        rectangle : {
            get : function() {
                return this._rectangle;
            }
        },

        /**
         * Gets the map projection used by this tiling scheme.
         * @memberof GeographicTilingScheme.prototype
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
    // 根据 z-level 来计算 x 方向的瓦片数量
    GeographicTilingScheme.prototype.getNumberOfXTilesAtLevel = function(level) {
        // 这里用到了比特位左移，相当于 2^level （即 2 的 level 次方）
        return this._numberOfLevelZeroTilesX << level;
    };

    /**
     * Gets the total number of tiles in the Y direction at a specified level-of-detail.
     *
     * @param {Number} level The level-of-detail.
     * @returns {Number} The number of tiles in the Y direction at the given level.
     */
    // 同上面的 x 一样，可以得到 y 方向的瓦片数量
    GeographicTilingScheme.prototype.getNumberOfYTilesAtLevel = function(level) {
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
    // 弧度坐标表示的矩形 变成 角度表示的矩形
    GeographicTilingScheme.prototype.rectangleToNativeRectangle = function(rectangle, result) {
        //>>includeStart('debug', pragmas.debug);
        Check.defined('rectangle', rectangle);
        //>>includeEnd('debug');

        // 输入的 rectangle 包含有四个弧度值， 分别是north，East 和 south，West.
        // 另外从弧度到角度的过程 = 弧度*180°/PI
        // 因为弧度的表达就是 X/PI
        var west = CesiumMath.toDegrees(rectangle.west);
        var south = CesiumMath.toDegrees(rectangle.south);
        var east = CesiumMath.toDegrees(rectangle.east);
        var north = CesiumMath.toDegrees(rectangle.north);

        if (!defined(result)) {
            return new Rectangle(west, south, east, north);
        }

        result.west = west;
        result.south = south;
        result.east = east;
        result.north = north;
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
    // 将瓦片矩阵index坐标转换为实际角度坐标值
    GeographicTilingScheme.prototype.tileXYToNativeRectangle = function(x, y, level, result) {
        // 将瓦片矩阵index坐标转换为实际地理坐标 （弧度表示）
        var rectangleRadians = this.tileXYToRectangle(x, y, level, result);
        // 转换为角度
        rectangleRadians.west = CesiumMath.toDegrees(rectangleRadians.west);
        rectangleRadians.south = CesiumMath.toDegrees(rectangleRadians.south);
        rectangleRadians.east = CesiumMath.toDegrees(rectangleRadians.east);
        rectangleRadians.north = CesiumMath.toDegrees(rectangleRadians.north);
        return rectangleRadians;
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
    // 输入为瓦片矩阵中的对于index值，转换为实际地理坐标弧度值的方法
    GeographicTilingScheme.prototype.tileXYToRectangle = function(x, y, level, result) {
        // 弧度表示的 rectangle
        var rectangle = this._rectangle;

        // 得到 x 方向瓦片数量
        var xTiles = this.getNumberOfXTilesAtLevel(level);
        // 得到 y 方向瓦片数量
        var yTiles = this.getNumberOfYTilesAtLevel(level);

        // 得到每个瓦片的宽度 = 总宽度 / 宽度方向上的瓦片数量
        var xTileWidth = rectangle.width / xTiles;
        // 得到输入瓦片的左侧边缘的实际地理坐标
        var west = x * xTileWidth + rectangle.west;
        // 得到输入瓦片右侧边缘的实际地理坐标
        var east = (x + 1) * xTileWidth + rectangle.west;

        // 同 x
        var yTileHeight = rectangle.height / yTiles;
        var north = rectangle.north - y * yTileHeight;
        var south = rectangle.north - (y + 1) * yTileHeight;

        if (!defined(result)) {
            result = new Rectangle(west, south, east, north);
        }

        result.west = west;
        result.south = south;
        result.east = east;
        result.north = north;
        return result;
    };

    /**
     * Calculates the tile x, y coordinates of the tile containing
     * a given cartographic position.
     *
     * @param {Cartographic} position The position. 地理坐标系的弧度表示
     * @param {Number} level The tile level-of-detail.  Zero is the least detailed.
     * @param {Cartesian2} [result] The instance to which to copy the result, or undefined if a new instance
     *        should be created.
     * @returns {Cartesian2} The specified 'result', or a new object containing the tile x, y coordinates
     *          if 'result' is undefined.
     */
    // 将坐标值转为瓦片矩阵的index值
    GeographicTilingScheme.prototype.positionToTileXY = function(position, level, result) {
        var rectangle = this._rectangle;
        if (!Rectangle.contains(rectangle, position)) {
            // outside the bounds of the tiling scheme
            return undefined;
        }

        var xTiles = this.getNumberOfXTilesAtLevel(level);
        var yTiles = this.getNumberOfYTilesAtLevel(level);

        // 得到单个瓦片的宽度
        var xTileWidth = rectangle.width / xTiles;
        // 得到单个瓦片的长度
        var yTileHeight = rectangle.height / yTiles;

        // 得到坐标经度
        var longitude = position.longitude;
        // 如果矩形的west即左侧大于east即右侧
        if (rectangle.east < rectangle.west) {
            // 经度自加 2*PI
            longitude += CesiumMath.TWO_PI;
        }

        // 得到瓦片矩阵的纵向（即col）的index值
        var xTileCoordinate = (longitude - rectangle.west) / xTileWidth | 0;
        if (xTileCoordinate >= xTiles) {
            xTileCoordinate = xTiles - 1;
        }

        // 得到瓦片矩阵横向（即row）的index值
        var yTileCoordinate = (rectangle.north - position.latitude) / yTileHeight | 0;
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

    return GeographicTilingScheme;
});
