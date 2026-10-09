var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/.pnpm/@mapbox+shp-write@0.4.3/node_modules/@mapbox/shp-write/src/types.js
var require_types = __commonJS({
  "node_modules/.pnpm/@mapbox+shp-write@0.4.3/node_modules/@mapbox/shp-write/src/types.js"(exports, module) {
    module.exports.geometries = {
      NULL: 0,
      POINT: 1,
      POLYLINE: 3,
      POLYGON: 5,
      MULTIPOINT: 8,
      POINTZ: 11,
      POLYLINEZ: 13,
      POLYGONZ: 15,
      MULTIPOINTZ: 18,
      POINTM: 21,
      POLYLINEM: 23,
      POLYGONM: 25,
      MULTIPOINTM: 28,
      MULTIPATCH: 31
    };
  }
});

// node_modules/.pnpm/dbf@0.2.0/node_modules/dbf/src/fieldsize.js
var require_fieldsize = __commonJS({
  "node_modules/.pnpm/dbf@0.2.0/node_modules/dbf/src/fieldsize.js"(exports, module) {
    module.exports = {
      // string
      C: 254,
      // boolean
      L: 1,
      // date
      D: 8,
      // number
      N: 18,
      // number
      M: 18,
      // number, float
      F: 18,
      // number
      B: 8
    };
  }
});

// node_modules/.pnpm/dbf@0.2.0/node_modules/dbf/src/lib.js
var require_lib = __commonJS({
  "node_modules/.pnpm/dbf@0.2.0/node_modules/dbf/src/lib.js"(exports, module) {
    module.exports.lpad = function lpad(str, len, char) {
      while (str.length < len) {
        str = char + str;
      }
      return str;
    };
    module.exports.rpad = function rpad(str, len, char) {
      while (str.length < len) {
        str = str + char;
      }
      return str;
    };
    module.exports.writeField = function writeField(view, fieldLength, str, offset) {
      for (var i = 0; i < fieldLength; i++) {
        view.setUint8(offset, str.charCodeAt(i));
        offset++;
      }
      return offset;
    };
  }
});

// node_modules/.pnpm/dbf@0.2.0/node_modules/dbf/src/fields.js
var require_fields = __commonJS({
  "node_modules/.pnpm/dbf@0.2.0/node_modules/dbf/src/fields.js"(exports, module) {
    var fieldSize = require_fieldsize();
    var types = {
      string: "C",
      number: "N",
      boolean: "L",
      // type to use if all values of a field are null
      null: "C"
    };
    module.exports.multi = multi;
    module.exports.bytesPer = bytesPer;
    module.exports.obj = obj;
    function multi(features) {
      var fields = {};
      features.forEach(collect);
      function collect(f) {
        inherit(fields, f);
      }
      return obj(fields);
    }
    function inherit(a, b) {
      for (var i in b) {
        var isDef = typeof b[i] !== "undefined" && b[i] !== null;
        if (typeof a[i] === "undefined" || isDef) {
          a[i] = b[i];
        }
      }
      return a;
    }
    function obj(_) {
      var fields = {}, o = [];
      for (var p in _) fields[p] = _[p] === null ? "null" : typeof _[p];
      for (var n in fields) {
        var t = types[fields[n]];
        if (t) {
          o.push({
            name: n,
            type: t,
            size: fieldSize[t]
          });
        }
      }
      return o;
    }
    function bytesPer(fields) {
      return fields.reduce(function(memo, f) {
        return memo + f.size;
      }, 1);
    }
  }
});

// node_modules/.pnpm/dbf@0.2.0/node_modules/dbf/src/structure.js
var require_structure = __commonJS({
  "node_modules/.pnpm/dbf@0.2.0/node_modules/dbf/src/structure.js"(exports, module) {
    var fieldSize = require_fieldsize();
    var lib = require_lib();
    var fields = require_fields();
    module.exports = function structure(data, meta) {
      var field_meta = meta || fields.multi(data), fieldDescLength = 32 * field_meta.length + 1, bytesPerRecord = fields.bytesPer(field_meta), buffer = new ArrayBuffer(
        // field header
        fieldDescLength + // header
        32 + // contents
        bytesPerRecord * data.length + // EOF marker
        1
      ), now = /* @__PURE__ */ new Date(), view = new DataView(buffer);
      view.setUint8(0, 3);
      view.setUint8(1, now.getFullYear() - 1900);
      view.setUint8(2, now.getMonth() + 1);
      view.setUint8(3, now.getDate());
      view.setUint32(4, data.length, true);
      var headerLength = fieldDescLength + 32;
      view.setUint16(8, headerLength, true);
      view.setUint16(10, bytesPerRecord, true);
      view.setInt8(32 + fieldDescLength - 1, 13);
      field_meta.forEach(function(f, i) {
        f.name.split("").slice(0, 10).forEach(function(c, x) {
          view.setInt8(32 + i * 32 + x, c.charCodeAt(0));
        });
        view.setInt8(32 + i * 32 + 11, f.type.charCodeAt(0));
        view.setInt8(32 + i * 32 + 16, f.size);
        if (f.type == "N") view.setInt8(32 + i * 32 + 17, 3);
      });
      var offset = fieldDescLength + 32;
      data.forEach(function(row, num) {
        view.setUint8(offset, 32);
        offset++;
        field_meta.forEach(function(f) {
          var val = row[f.name];
          if (val === null || typeof val === "undefined") val = "";
          switch (f.type) {
            // boolean
            case "L":
              view.setUint8(offset, val ? 84 : 70);
              offset++;
              break;
            // date
            case "D":
              offset = lib.writeField(
                view,
                8,
                lib.lpad(val.toString(), 8, " "),
                offset
              );
              break;
            // number
            case "N":
              offset = lib.writeField(
                view,
                f.size,
                lib.lpad(val.toString(), f.size, " ").substr(0, 18),
                offset
              );
              break;
            // string
            case "C":
              offset = lib.writeField(
                view,
                f.size,
                lib.rpad(val.toString(), f.size, " "),
                offset
              );
              break;
            default:
              throw new Error("Unknown field type");
          }
        });
      });
      view.setUint8(offset, 26);
      return view;
    };
  }
});

// node_modules/.pnpm/dbf@0.2.0/node_modules/dbf/index.js
var require_dbf = __commonJS({
  "node_modules/.pnpm/dbf@0.2.0/node_modules/dbf/index.js"(exports, module) {
    module.exports.structure = require_structure();
  }
});

// node_modules/.pnpm/@mapbox+shp-write@0.4.3/node_modules/@mapbox/shp-write/src/prj.js
var require_prj = __commonJS({
  "node_modules/.pnpm/@mapbox+shp-write@0.4.3/node_modules/@mapbox/shp-write/src/prj.js"(exports, module) {
    module.exports = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]';
  }
});

// node_modules/.pnpm/@mapbox+shp-write@0.4.3/node_modules/@mapbox/shp-write/src/extent.js
var require_extent = __commonJS({
  "node_modules/.pnpm/@mapbox+shp-write@0.4.3/node_modules/@mapbox/shp-write/src/extent.js"(exports, module) {
    module.exports.enlarge = function enlargeExtent(extent, pt) {
      if (pt[0] < extent.xmin) extent.xmin = pt[0];
      if (pt[0] > extent.xmax) extent.xmax = pt[0];
      if (pt[1] < extent.ymin) extent.ymin = pt[1];
      if (pt[1] > extent.ymax) extent.ymax = pt[1];
      return extent;
    };
    module.exports.enlargeExtent = function enlargeExtent(extent, ext) {
      if (ext.xmax > extent.xmax) extent.xmax = ext.xmax;
      if (ext.xmin < extent.xmin) extent.xmin = ext.xmin;
      if (ext.ymax > extent.ymax) extent.ymax = ext.ymax;
      if (ext.ymin < extent.ymin) extent.ymin = ext.ymin;
      return extent;
    };
    module.exports.blank = function() {
      return {
        xmin: Number.MAX_VALUE,
        ymin: Number.MAX_VALUE,
        xmax: -Number.MAX_VALUE,
        ymax: -Number.MAX_VALUE
      };
    };
  }
});

// node_modules/.pnpm/@mapbox+shp-write@0.4.3/node_modules/@mapbox/shp-write/src/points.js
var require_points = __commonJS({
  "node_modules/.pnpm/@mapbox+shp-write@0.4.3/node_modules/@mapbox/shp-write/src/points.js"(exports, module) {
    var ext = require_extent();
    module.exports.write = function writePoints(coordinates, extent, shpView, shxView) {
      var contentLength = 28, fileLength = 100, shpI = 0, shxI = 0;
      coordinates.forEach(function writePoint(coords, i) {
        shpView.setInt32(shpI, i + 1);
        shpView.setInt32(shpI + 4, 10);
        shpView.setInt32(shpI + 8, 1, true);
        shpView.setFloat64(shpI + 12, coords[0], true);
        shpView.setFloat64(shpI + 20, coords[1], true);
        shxView.setInt32(shxI, fileLength / 2);
        shxView.setInt32(shxI + 4, 10);
        shxI += 8;
        shpI += contentLength;
        fileLength += contentLength;
      });
    };
    module.exports.extent = function(coordinates) {
      return coordinates.reduce(function(extent, coords) {
        return ext.enlarge(extent, coords);
      }, ext.blank());
    };
    module.exports.parts = function parts(geometries, TYPE) {
      return geometries.length;
    };
    module.exports.shxLength = function(coordinates) {
      return coordinates.length * 8;
    };
    module.exports.shpLength = function(coordinates) {
      return coordinates.length * 28;
    };
  }
});

// node_modules/.pnpm/@mapbox+shp-write@0.4.3/node_modules/@mapbox/shp-write/src/poly.js
var require_poly = __commonJS({
  "node_modules/.pnpm/@mapbox+shp-write@0.4.3/node_modules/@mapbox/shp-write/src/poly.js"(exports, module) {
    var ext = require_extent();
    var types = require_types();
    module.exports.write = function writePoints(geometries, extent, shpView, shxView, TYPE) {
      var shpI = 0, shxI = 0, shxOffset = 100;
      geometries.forEach(writePolyLine);
      function writePolyLine(coordinates, i) {
        var flattened = justCoords(coordinates), noParts = parts([coordinates], TYPE), contentLength = flattened.length * 16 + 48 + (noParts - 1) * 4;
        var featureExtent = flattened.reduce(function(extent2, c) {
          return ext.enlarge(extent2, c);
        }, ext.blank());
        shxView.setInt32(shxI, shxOffset / 2);
        shxView.setInt32(shxI + 4, contentLength / 2);
        shxI += 8;
        shxOffset += contentLength + 8;
        shpView.setInt32(shpI, i + 1);
        shpView.setInt32(shpI + 4, contentLength / 2);
        shpView.setInt32(shpI + 8, TYPE, true);
        shpView.setFloat64(shpI + 12, featureExtent.xmin, true);
        shpView.setFloat64(shpI + 20, featureExtent.ymin, true);
        shpView.setFloat64(shpI + 28, featureExtent.xmax, true);
        shpView.setFloat64(shpI + 36, featureExtent.ymax, true);
        shpView.setInt32(shpI + 44, noParts, true);
        shpView.setInt32(shpI + 48, flattened.length, true);
        shpView.setInt32(shpI + 52, 0, true);
        var onlyParts = coordinates.reduce(function(arr, coords) {
          if (Array.isArray(coords[0][0])) {
            arr = arr.concat(coords);
          } else {
            arr.push(coords);
          }
          return arr;
        }, []);
        for (var p = 1; p < noParts; p++) {
          shpView.setInt32(
            // set part index
            shpI + 52 + p * 4,
            onlyParts.reduce(function(a, b, idx) {
              return idx < p ? a + b.length : a;
            }, 0),
            true
          );
        }
        flattened.forEach(function writeLine(coords, i2) {
          shpView.setFloat64(shpI + 56 + i2 * 16 + (noParts - 1) * 4, coords[0], true);
          shpView.setFloat64(shpI + 56 + i2 * 16 + (noParts - 1) * 4 + 8, coords[1], true);
        });
        shpI += contentLength + 8;
      }
    };
    module.exports.shpLength = function(geometries) {
      return geometries.length * 56 + // points
      justCoords(geometries).length * 16;
    };
    module.exports.shxLength = function(geometries) {
      return geometries.length * 8;
    };
    module.exports.extent = function(coordinates) {
      return justCoords(coordinates).reduce(function(extent, c) {
        return ext.enlarge(extent, c);
      }, ext.blank());
    };
    function parts(geometries, TYPE) {
      var no = 1;
      if (TYPE === types.geometries.POLYGON || TYPE === types.geometries.POLYLINE) {
        no = geometries.reduce(function(no2, coords) {
          no2 += coords.length;
          if (Array.isArray(coords[0][0][0])) {
            no2 += coords.reduce(function(no3, rings) {
              return no3 + rings.length - 1;
            }, 0);
          }
          return no2;
        }, 0);
      }
      return no;
    }
    module.exports.parts = parts;
    function justCoords(coords, l) {
      if (l === void 0) l = [];
      if (typeof coords[0][0] == "object") {
        return coords.reduce(function(memo, c) {
          return memo.concat(justCoords(c));
        }, l);
      } else {
        return coords;
      }
    }
  }
});

// node_modules/.pnpm/@mapbox+shp-write@0.4.3/node_modules/@mapbox/shp-write/src/write.js
var require_write = __commonJS({
  "node_modules/.pnpm/@mapbox+shp-write@0.4.3/node_modules/@mapbox/shp-write/src/write.js"(exports, module) {
    var types = require_types();
    var dbf = require_dbf();
    var prj = require_prj();
    var pointWriter = require_points();
    var polyWriter = require_poly();
    var writers = {
      1: pointWriter,
      5: polyWriter,
      3: polyWriter
    };
    module.exports = write;
    function write(rows, geometry_type, geometries, callback) {
      var TYPE = types.geometries[geometry_type];
      var writer = writers[TYPE];
      var parts = writer.parts(geometries, TYPE);
      var shpLength = 100 + (parts - geometries.length) * 4 + writer.shpLength(geometries);
      var shxLength = 100 + writer.shxLength(geometries);
      var shpBuffer = new ArrayBuffer(shpLength);
      var shpView = new DataView(shpBuffer);
      var shxBuffer = new ArrayBuffer(shxLength);
      var shxView = new DataView(shxBuffer);
      var extent = writer.extent(geometries);
      writeHeader(shpView, TYPE);
      writeHeader(shxView, TYPE);
      writeExtent(extent, shpView);
      writeExtent(extent, shxView);
      writer.write(
        geometries,
        extent,
        new DataView(shpBuffer, 100),
        new DataView(shxBuffer, 100),
        TYPE
      );
      shpView.setInt32(24, shpLength / 2);
      shxView.setInt32(24, 50 + geometries.length * 4);
      var dbfBuf = dbf.structure(rows);
      callback(null, {
        shp: shpView,
        shx: shxView,
        dbf: dbfBuf,
        prj
      });
    }
    function writeHeader(view, TYPE) {
      view.setInt32(0, 9994);
      view.setInt32(28, 1e3, true);
      view.setInt32(32, TYPE, true);
    }
    function writeExtent(extent, view) {
      view.setFloat64(36, extent.xmin, true);
      view.setFloat64(44, extent.ymin, true);
      view.setFloat64(52, extent.xmax, true);
      view.setFloat64(60, extent.ymax, true);
    }
  }
});
export default require_write();
