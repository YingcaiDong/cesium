/*global define*/
define([
        '../Core/Cartesian2',
        '../Core/Cartesian4',
        '../Core/Color',
        '../Core/combine',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/destroyObject',
        '../Core/DeveloperError',
        '../Core/PixelFormat',
        '../Renderer/Context',
        '../Renderer/PixelDatatype',
        '../Renderer/ShaderSource',
        '../Renderer/TextureMinificationFilter',
        '../Renderer/TextureMagnificationFilter',
        './Cesium3DTileContentState',
        './Model',
        './BatchedModel',
        '../ThirdParty/when'
    ], function(
        Cartesian2,
        Cartesian4,
        Color,
        combine,
        defaultValue,
        defined,
        defineProperties,
        destroyObject,
        DeveloperError,
        PixelFormat,
        Context,
        PixelDatatype,
        ShaderSource,
        TextureMinificationFilter,
        TextureMagnificationFilter,
        Cesium3DTileContentState,
        Model,
        BatchedModel,
        when) {
    "use strict";

    /**
     * @private
     */
    var Gltf3DTileContentProvider = function(url, contentHeader) {
        this._model = undefined;
        this._url = url;

        /**
         * @readonly
         */
        this.state = Cesium3DTileContentState.UNLOADED;

        /**
         * @type {Promise}
         */
        this.processingPromise = when.defer();

        /**
         * @type {Promise}
         */
        this.readyPromise = when.defer();

        this._batchSize = defaultValue(contentHeader.batchSize, 0);  // Number of models, e.g., buildings, batched into the glTF model.
        this._batchValues = undefined;                               // Per-model show/color
        this._batchValuesDirty = false;
        this._batchTexture = undefined;
        this._batchTextureDimensions = undefined;
        this._batchTextureStep = undefined;
        this._useVTF = false;

        this._pickTexture = undefined;
        this._pickIds = [];

        this._debugColor = Color.fromRandom({ alpha : 1.0 });
        this._debugColorizeTiles = false;
    };

    defineProperties(Gltf3DTileContentProvider.prototype, {
        /**
         * DOC_TBA
         */
        batchSize : {
            get : function() {
                return this._batchSize;
            }
        }
    });

    function getByteLength(batchSize) {
        var width = Math.min(batchSize, Context.maximumTextureSize);
        var height = Math.ceil(batchSize / Context.maximumTextureSize);
        return (width * height) * 4;
    }

    function createBatchValues(batchSize) {
        // Default batch texture to RGBA = 255: white highlight (RGB) and show = true (A).
        var byteLength = getByteLength(batchSize);
        var bytes = new Uint8Array(byteLength);
        for (var i = 0; i < byteLength; ++i) {
            bytes[i] = 255;
        }

bytes[0] = 255;
bytes[1] = 0;
bytes[2] = 0;
bytes[3] = 255;

bytes[4] = 0;
bytes[5] = 255;
bytes[6] = 0;
bytes[7] = 255;

bytes[8] = 0;
bytes[9] = 0;
bytes[10] = 255;
bytes[11] = 255;

        return bytes;
    }

    function getBatchValues(content) {
        if (!defined(content._batchValues)) {
            content._batchValues = createBatchValues(content._batchSize);
        }

        return content._batchValues;
    }

    /**
     * @private
     */
    Gltf3DTileContentProvider.prototype.setShow = function(batchId, value) {
        var batchSize = this._batchSize;
        //>>includeStart('debug', pragmas.debug);
        if (!defined(batchId) || (batchId < 0) || (batchId > batchSize)) {
            throw new DeveloperError('batchId is required and between zero and batchSize - 1 (' + batchSize - + ').');
        }

        if (!defined(value)) {
            throw new DeveloperError('value is required.');
        }
        //>>includeEnd('debug');

        var batchValues = getBatchValues(this);
        var offset = (batchId * 4) + 3; // Store show/hide in alpha
        var newValue = value ? 255 : 0;

        if (batchValues[offset] !== newValue) {
            batchValues[offset] = newValue;
            this._batchValuesDirty = true;
        }
    };

    /**
     * @private
     */
    Gltf3DTileContentProvider.prototype.getShow = function(batchId) {
        var batchSize = this._batchSize;
        //>>includeStart('debug', pragmas.debug);
        if (!defined(batchId) || (batchId < 0) || (batchId > batchSize)) {
            throw new DeveloperError('batchId is required and between zero and batchSize - 1 (' + batchSize - + ').');
        }
        //>>includeEnd('debug');

        if (!defined(this._batchValues)) {
            // Batched models default to true
            return true;
        }

        var offset = (batchId * 4) + 3; // Store show/hide in alpha
        return this._batchValues[offset] === 255;
    };

    var scratchColor = new Array(4);

    /**
     * @private
     */
    Gltf3DTileContentProvider.prototype.setColor = function(batchId, value) {
        var batchSize = this._batchSize;
        //>>includeStart('debug', pragmas.debug);
        if (!defined(batchId) || (batchId < 0) || (batchId > batchSize)) {
            throw new DeveloperError('batchId is required and between zero and batchSize - 1 (' + batchSize - + ').');
        }

        if (!defined(value)) {
            throw new DeveloperError('value is required.');
        }
        //>>includeEnd('debug');

        var batchValues = getBatchValues(this);
        var offset = batchId * 4;
        var newValue = value.toBytes(scratchColor);

        if ((batchValues[offset] !== newValue[0]) ||
                (batchValues[offset + 1] !== newValue[1]) ||
                (batchValues[offset + 2] !== newValue[2])) {
            batchValues[offset] = newValue[0];
            batchValues[offset + 1] = newValue[1];
            batchValues[offset + 2] = newValue[2];
            this._batchValuesDirty = true;
        }
    };

    /**
     * DOC_TBA
     */
    Gltf3DTileContentProvider.prototype.setAllColor = function(value) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(value)) {
            throw new DeveloperError('value is required.');
        }
        //>>includeEnd('debug');

        var batchSize = this._batchSize;
        for (var i = 0; i < batchSize; ++i) {
            // PERFORMANCE_IDEA: duplicate part of setColor here to factor things out of the loop
            this.setColor(i, value);
        }
    };

    /**
     * @private
     */
    Gltf3DTileContentProvider.prototype.getColor = function(batchId, color) {
        var batchSize = this._batchSize;
        //>>includeStart('debug', pragmas.debug);
        if (!defined(batchId) || (batchId < 0) || (batchId > batchSize)) {
            throw new DeveloperError('batchId is required and between zero and batchSize - 1 (' + batchSize - + ').');
        }

        if (!defined(color)) {
            throw new DeveloperError('color is required.');
        }
        //>>includeEnd('debug');

        if (!defined(this._batchValues)) {
            // Batched models default to WHITE
            return Color.clone(Color.WHITE, color);
        }

        var batchValues = this._batchValues;
        var offset = batchId * 4;
        return Color.fromBytes(batchValues[offset], batchValues[offset + 1], batchValues[offset + 2], 255, color);
    };

    ///////////////////////////////////////////////////////////////////////////

    function getGlslComputeSt(content) {
        // GLSL batchId is zero-based: [0, batchSize - 1]
        if (content._batchTextureDimensions.y === 1) {
            return 'uniform vec4 tiles3d_batchTextureStep; \n' +
                'vec2 computeSt(int batchId) \n' +
                '{ \n' +
                '    float stepX = tiles3d_batchTextureStep.x; \n ' +
                '    float centerX = tiles3d_batchTextureStep.y; \n ' +
                '    return vec2(centerX + (float(batchId) * stepX), 0.5); \n' +
                '} \n';
        }

        return 'uniform vec4 tiles3d_batchTextureStep; \n' +
            'uniform vec2 tiles3d_batchTextureDimensions; \n' +
            'vec2 computeSt(int batchId) \n' +
            '{ \n' +
            '    float stepX = tiles3d_batchTextureStep.x; \n ' +
            '    float centerX = tiles3d_batchTextureStep.y; \n ' +
            '    float stepY = tiles3d_batchTextureStep.z; \n ' +
            '    float centerY = tiles3d_batchTextureStep.w; \n ' +
            '    float xId = mod(float(batchId), tiles3d_batchTextureDimensions.x); \n ' +
            '    float yId = float(batchId / int(tiles3d_batchTextureDimensions.x)); \n ' +
            '    return vec2(centerX + (xId * stepX), 1.0 - (centerY + (yId * stepY))); \n' +
            '} \n';
    }

    function getVertexShaderCallback(content) {
        if (content._batchSize === 0) {
            // Do not change vertex shader source; the model was not batched
            return undefined;
        }

        return function(source) {
            var renamedSource = ShaderSource.replaceMain(source, 'gltf_main');
            var newMain;

            if (content._useVTF) {
                // When VTF is supported, perform per patched model (e.g., building) show/hide in the vertex shader
                newMain =
                    'uniform sampler2D tiles3d_batchTexture; \n' +
// TODO: get batch id from vertex attribute
                    'int batchId = 0; \n' +
                    'varying vec3 tiles3d_modelColor; \n' +
                    'void main() \n' +
                    '{ \n' +
                    '    gltf_main(); \n' +
                    '    vec2 st = computeSt(batchId); \n' +
                    '    vec4 modelProperties = texture2D(tiles3d_batchTexture, st); \n' +
                    '    float show = modelProperties.a; \n' +
                    '    gl_Position *= show; \n' +                       // Per batched model show/hide
                    '    tiles3d_modelColor = modelProperties.rgb; \n' +   // Pass batched model color to fragment shader
                    '}';
            } else {
                newMain =
// TODO: get batch id from vertex attribute
                    'int batchId = 0; \n' +
                    'varying vec2 tiles3d_modelSt; \n' +
                    'void main() \n' +
                    '{ \n' +
                    '    gltf_main(); \n' +
                    '    tiles3d_modelSt = computeSt(batchId); \n' +
                    '}';
            }

            return renamedSource + '\n' + getGlslComputeSt(content) + newMain;
        };
    }

    function getFragmentShaderCallback(content) {
        if (content._batchSize === 0) {
            // Do not change fragment shader source; the model was not batched
            return undefined;
        }

        return function(source) {
            var renamedSource = ShaderSource.replaceMain(source, 'gltf_main');
            var newMain;

            if (content._useVTF) {
                // When VTF is supported, per patched model (e.g., building) show/hide already
                // happened in the fragment shader
                newMain =
                    'varying vec3 tiles3d_modelColor; \n' +
                    'void main() \n' +
                    '{ \n' +
                    '    gltf_main(); \n' +
                    '    gl_FragColor.rgb *= tiles3d_modelColor; \n' +
                    '}';
            } else {
                newMain =
                    'uniform sampler2D tiles3d_batchTexture; \n' +
                    'varying vec2 tiles3d_modelSt; \n' +
                    'void main() \n' +
                    '{ \n' +
                    '    vec4 modelProperties = texture2D(tiles3d_batchTexture, tiles3d_modelSt); \n' +
                    '    if (modelProperties.a == 0.0) { \n' +
                    '        discard; \n' +
                    '    } \n' +
                    '    gltf_main(); \n' +
                    '    gl_FragColor.rgb *= modelProperties.rgb; \n' +
                    '}';
            }

            return renamedSource + '\n' + newMain;
        };
    }

    function getUniformMapCallback(content) {
        if (content._batchSize === 0) {
            // Do not change the uniform map; the model was not batched
            return undefined;
        }

        return function(uniformMap) {
            var batchUniformMap = {
                tiles3d_batchTexture : function() {
                    return content._batchTexture;
                },
                tiles3d_batchTextureDimensions : function() {
                    return content._batchTextureDimensions;
                },
                tiles3d_batchTextureStep : function() {
                    return content._batchTextureStep;
                }
            };

            return combine(uniformMap, batchUniformMap);
        };
    }

    ///////////////////////////////////////////////////////////////////////////

    function getPickVertexShaderCallback(content) {
        if (content._batchSize === 0) {
            // Do not change vertex shader source; the model was not batched
            return undefined;
        }

        return function(source) {
            var renamedSource = ShaderSource.replaceMain(source, 'gltf_main');
            var newMain;

            if (content._useVTF) {
                // When VTF is supported, perform per patched model (e.g., building) show/hide in the vertex shader
                newMain =
                    'uniform sampler2D tiles3d_batchTexture; \n' +
// TODO: get batch id from vertex attribute
                    'int batchId = 0; \n' +
                    'varying vec2 tiles3d_modelSt; \n' +
                    'void main() \n' +
                    '{ \n' +
                    '    gltf_main(); \n' +
                    '    vec2 st = computeSt(batchId); \n' +
                    '    vec4 modelProperties = texture2D(tiles3d_batchTexture, st); \n' +
                    '    float show = modelProperties.a; \n' +
                    '    gl_Position *= show; \n' +                       // Per batched model show/hide
                    '    tiles3d_modelSt = st; \n' +
                    '}';
            } else {
                newMain =
// TODO: get batch id from vertex attribute
                    'int batchId = 0; \n' +
                    'varying vec2 tiles3d_modelSt; \n' +
                    'void main() \n' +
                    '{ \n' +
                    '    gltf_main(); \n' +
                    '    tiles3d_modelSt = computeSt(batchId); \n' +
                    '}';
            }

            return renamedSource + '\n' + getGlslComputeSt(content) + newMain;
        };
    }

    function getPickFragmentShaderCallback(content) {
        if (content._batchSize === 0) {
            // Do not change fragment shader source; the model was not batched
            return undefined;
        }

        return function(source) {
            var renamedSource = ShaderSource.replaceMain(source, 'gltf_main');
            var newMain;

            if (content._useVTF) {
                // When VTF is supported, per patched model (e.g., building) show/hide already
                // happened in the fragment shader
                newMain =
                    'uniform sampler2D tiles3d_pickTexture; \n' +
                    'varying vec2 tiles3d_modelSt; \n' +
                    'void main() \n' +
                    '{ \n' +
                    '    gltf_main(); \n' +
                    '    if (gl_FragColor.a == 0.0) { \n' +
                    '        discard; \n' +
                    '    } \n' +
                    '    gl_FragColor = texture2D(tiles3d_pickTexture, tiles3d_modelSt); \n' +
                    '}';
            } else {
                newMain =
                    'uniform sampler2D tiles3d_pickTexture; \n' +
                    'uniform sampler2D tiles3d_batchTexture; \n' +
                    'varying vec2 tiles3d_modelSt; \n' +
                    'void main() \n' +
                    '{ \n' +
                    '    vec4 modelProperties = texture2D(tiles3d_batchTexture, tiles3d_modelSt); \n' +
                    '    if (modelProperties.a == 0.0) { \n' +
                    '        discard; \n' +                       // Per batched model show/hide
                    '    } \n' +
                    '    gltf_main(); \n' +
                    '    if (gl_FragColor.a == 0.0) { \n' +
                    '        discard; \n' +
                    '    } \n' +
                    '    gl_FragColor = texture2D(tiles3d_pickTexture, tiles3d_modelSt); \n' +
                    '}';
            }

            return renamedSource + '\n' + newMain;
        };
    }

    function getPickUniformMapCallback(content) {
        if (content._batchSize === 0) {
            // Do not change the uniform map; the model was not batched
            return undefined;
        }

        return function(uniformMap) {
            var batchUniformMap = {
                tiles3d_batchTexture : function() {
                    return content._batchTexture;
                },
                tiles3d_batchTextureDimensions : function() {
                    return content._batchTextureDimensions;
                },
                tiles3d_batchTextureStep : function() {
                    return content._batchTextureStep;
                },
                tiles3d_pickTexture : function() {
                    return content._pickTexture;
                }
            };

            return combine(uniformMap, batchUniformMap);
        };
    }

    ///////////////////////////////////////////////////////////////////////////

    Gltf3DTileContentProvider.prototype.request = function() {
        // PERFORMANCE_IDEA: patch the shader on demand, e.g., the first time show/color changes.
        // The pitch shader still needs to be patched.
        var model = Model.fromGltf({
            url : this._url,
            cull : false,           // The model is already culled by the 3D tiles
            releaseGltfJson : true, // Models are unique and will not benefit from caching so save memory
            vertexShaderLoaded : getVertexShaderCallback(this),
            fragmentShaderLoaded : getFragmentShaderCallback(this),
            uniformMapLoaded : getUniformMapCallback(this),
            pickVertexShaderLoaded : getPickVertexShaderCallback(this),
            pickFragmentShaderLoaded : getPickFragmentShaderCallback(this),
            pickUniformMapLoaded : getPickUniformMapCallback(this)
        });

        var that = this;
        when(model.readyPromise).then(function(model) {
            that.state = Cesium3DTileContentState.READY;
            that.readyPromise.resolve(that);
        }).otherwise(function(error) {
            that.state = Cesium3DTileContentState.FAILED;
            that.readyPromise.reject(error);
        });

        this._model = model;
// TODO: allow this to not change the state depending on if the request is actually made, e.g., with RequestsByServer.
        this.state = Cesium3DTileContentState.PROCESSING;
        this.processingPromise.resolve(this);
    };

     function applyDebugSettings(owner, content) {
        if (content.state === Cesium3DTileContentState.READY) {
            if (owner.debugColorizeTiles && !content._debugColorizeTiles) {
                content._debugColorizeTiles = true;
                content.setAllColor(content._debugColor);
            } else if (!owner.debugColorizeTiles && content._debugColorizeTiles) {
                content._debugColorizeTiles = false;
                content.setAllColor(Color.WHITE);
            }
        }
    }

    function createTexture(context, batchSize, bytes) {
        // PERFORMANCE_IDEA: this can waste memory in the top row in the uncommon case
        // when more than one row is needed (e.g., > 16K models in one tile)
        var width = Math.min(batchSize, Context.maximumTextureSize);
        var height = Math.ceil(batchSize / Context.maximumTextureSize);

        return context.createTexture2D({
            pixelFormat : PixelFormat.RGBA,
            pixelDatatype : PixelDatatype.UNSIGNED_BYTE,
            source : {
                width : width,
                height : height,
                arrayBufferView : bytes
            },
            sampler : context.createSampler({
                minificationFilter : TextureMinificationFilter.NEAREST,
                magnificationFilter : TextureMagnificationFilter.NEAREST
            })
        });
    }

    function createPickTexture(content, context) {
        var batchSize = content._batchSize;
        if (!defined(content._pickTexture) && (batchSize > 0)) {
            var pickIds = content._pickIds;
            var byteLength = getByteLength(batchSize);
            var bytes = new Uint8Array(byteLength);

            // PERFORMANCE_IDEA: we could skip the pick texture completely by allocating
            // a continuous range of pickIds and then converting the base pickId + batchId
            // to RGBA in the shader.  The only consider is precision issues, which might
            // not be an issue in WebGL 2.
            for (var i = 0; i < batchSize; ++i) {
// TODO: What else should go into the owner passed to createPickId?
                var pickId = context.createPickId(new BatchedModel(content, i));
                pickIds.push(pickId);

                var pickColor = pickId.color;
                var offset = i * 4;
                bytes[offset] = Color.floatToByte(pickColor.red);
                bytes[offset + 1] = Color.floatToByte(pickColor.green);
                bytes[offset + 2] = Color.floatToByte(pickColor.blue);
                bytes[offset + 3] = Color.floatToByte(pickColor.alpha);
            }

            content._pickTexture = createTexture(context, batchSize, bytes, PixelDatatype.FLOAT);
        }
    }

    function createBatchTexture(content, context) {
        var batchSize = content._batchSize;
        if (!defined(content._batchTexture) && (batchSize > 0)) {
            var bytes = defined(content._batchValues) ? content._batchValues : createBatchValues(batchSize);
            var texture = createTexture(context, batchSize, bytes);
            var stepX = 1.0 / texture.width;
            var centerX = stepX * 0.5;
            var stepY = 1.0 / texture.height;
            var centerY = stepY * 0.5;

            content._batchTexture = texture;
            content._batchTextureDimensions = new Cartesian2(texture.width, texture.height);
            content._batchTextureStep = new Cartesian4(stepX, centerX, stepY, centerY);
            content._useVTF = (context.maximumVertexTextureImageUnits > 0);
            content._batchValuesDirty = false;
        }
    }

    function updateBatchTexture(content, context) {
        if (content._batchValuesDirty) {
            content._batchValuesDirty = false;

            var dimensions = content._batchTextureDimensions;
            // PERFORMANCE_IDEA: Instead of rewriting the entire texture, use fine-grained
            // texture updates when less than, for example, 10%, of the values changed.  Or
            // even just optimize the common case when one model show/color changed.
            content._batchTexture.copyFrom({
                width : dimensions.x,
                height : dimensions.y,
                arrayBufferView : content._batchValues
            });
        }
    }

    Gltf3DTileContentProvider.prototype.update = function(owner, context, frameState, commandList) {
        // In the LOADED state we may be calling update() to move forward
        // the content's resource loading.  In the READY state, it will
        // actually generate commands.

        applyDebugSettings(owner, this);

        createPickTexture(this, context);
        createBatchTexture(this, context);
        updateBatchTexture(this, context);  // Apply per-model show/color updates

        this._model.update(context, frameState, commandList);
   };

    Gltf3DTileContentProvider.prototype.isDestroyed = function() {
        return false;
    };

    Gltf3DTileContentProvider.prototype.destroy = function() {
        this._model = this._model && this._model.destroy();
        this._batchTexture = this._batchTexture && this._batchTexture.destroy();
        this._pickTexture = this._pickTexture && this._pickTexture.destroy();

        var pickIds = this._pickIds;
        var length = pickIds.length;
        for (var i = 0; i < length; ++i) {
            pickIds[i].destroy();
        }

        return destroyObject(this);
    };

    return Gltf3DTileContentProvider;
});