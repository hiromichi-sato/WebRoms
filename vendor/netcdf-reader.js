// node_modules/.pnpm/iobuffer@5.4.0/node_modules/iobuffer/lib-esm/text.js
function decode(bytes, encoding = "utf8") {
  const decoder = new TextDecoder(encoding);
  return decoder.decode(bytes);
}
var encoder = new TextEncoder();
function encode(str) {
  return encoder.encode(str);
}

// node_modules/.pnpm/iobuffer@5.4.0/node_modules/iobuffer/lib-esm/IOBuffer.js
var defaultByteLength = 1024 * 8;
var hostBigEndian = (() => {
  const array = new Uint8Array(4);
  const view = new Uint32Array(array.buffer);
  return !((view[0] = 1) & array[0]);
})();
var typedArrays = {
  int8: globalThis.Int8Array,
  uint8: globalThis.Uint8Array,
  int16: globalThis.Int16Array,
  uint16: globalThis.Uint16Array,
  int32: globalThis.Int32Array,
  uint32: globalThis.Uint32Array,
  uint64: globalThis.BigUint64Array,
  int64: globalThis.BigInt64Array,
  float32: globalThis.Float32Array,
  float64: globalThis.Float64Array
};
var IOBuffer = class _IOBuffer {
  /**
   * Reference to the internal ArrayBuffer object.
   */
  buffer;
  /**
   * Byte length of the internal ArrayBuffer.
   */
  byteLength;
  /**
   * Byte offset of the internal ArrayBuffer.
   */
  byteOffset;
  /**
   * Byte length of the internal ArrayBuffer.
   */
  length;
  /**
   * The current offset of the buffer's pointer.
   */
  offset;
  lastWrittenByte;
  littleEndian;
  _data;
  _mark;
  _marks;
  /**
   * Create a new IOBuffer.
   * @param data - The data to construct the IOBuffer with.
   * If data is a number, it will be the new buffer's length<br>
   * If data is `undefined`, the buffer will be initialized with a default length of 8Kb<br>
   * If data is an ArrayBuffer, SharedArrayBuffer, an ArrayBufferView (Typed Array), an IOBuffer instance,
   * or a Node.js Buffer, a view will be created over the underlying ArrayBuffer.
   * @param options - An object for the options.
   * @returns A new IOBuffer instance.
   */
  constructor(data = defaultByteLength, options = {}) {
    let dataIsGiven = false;
    if (typeof data === "number") {
      data = new ArrayBuffer(data);
    } else {
      dataIsGiven = true;
      this.lastWrittenByte = data.byteLength;
    }
    const offset = options.offset ? options.offset >>> 0 : 0;
    const byteLength = data.byteLength - offset;
    let dvOffset = offset;
    if (ArrayBuffer.isView(data) || data instanceof _IOBuffer) {
      if (data.byteLength !== data.buffer.byteLength) {
        dvOffset = data.byteOffset + offset;
      }
      data = data.buffer;
    }
    if (dataIsGiven) {
      this.lastWrittenByte = byteLength;
    } else {
      this.lastWrittenByte = 0;
    }
    this.buffer = data;
    this.length = byteLength;
    this.byteLength = byteLength;
    this.byteOffset = dvOffset;
    this.offset = 0;
    this.littleEndian = true;
    this._data = new DataView(this.buffer, dvOffset, byteLength);
    this._mark = 0;
    this._marks = [];
  }
  /**
   * Checks if the memory allocated to the buffer is sufficient to store more
   * bytes after the offset.
   * @param byteLength - The needed memory in bytes.
   * @returns `true` if there is sufficient space and `false` otherwise.
   */
  available(byteLength = 1) {
    return this.offset + byteLength <= this.length;
  }
  /**
   * Check if little-endian mode is used for reading and writing multi-byte
   * values.
   * @returns `true` if little-endian mode is used, `false` otherwise.
   */
  isLittleEndian() {
    return this.littleEndian;
  }
  /**
   * Set little-endian mode for reading and writing multi-byte values.
   * @returns This.
   */
  setLittleEndian() {
    this.littleEndian = true;
    return this;
  }
  /**
   * Check if big-endian mode is used for reading and writing multi-byte values.
   * @returns `true` if big-endian mode is used, `false` otherwise.
   */
  isBigEndian() {
    return !this.littleEndian;
  }
  /**
   * Switches to big-endian mode for reading and writing multi-byte values.
   * @returns This.
   */
  setBigEndian() {
    this.littleEndian = false;
    return this;
  }
  /**
   * Move the pointer n bytes forward.
   * @param n - Number of bytes to skip.
   * @returns This.
   */
  skip(n = 1) {
    this.offset += n;
    return this;
  }
  /**
   * Move the pointer n bytes backward.
   * @param n - Number of bytes to move back.
   * @returns This.
   */
  back(n = 1) {
    this.offset -= n;
    return this;
  }
  /**
   * Move the pointer to the given offset.
   * @param offset - The offset to move to.
   * @returns This.
   */
  seek(offset) {
    this.offset = offset;
    return this;
  }
  /**
   * Store the current pointer offset.
   * @see {@link IOBuffer#reset}
   * @returns This.
   */
  mark() {
    this._mark = this.offset;
    return this;
  }
  /**
   * Move the pointer back to the last pointer offset set by mark.
   * @see {@link IOBuffer#mark}
   * @returns This.
   */
  reset() {
    this.offset = this._mark;
    return this;
  }
  /**
   * Push the current pointer offset to the mark stack.
   * @see {@link IOBuffer#popMark}
   * @returns This.
   */
  pushMark() {
    this._marks.push(this.offset);
    return this;
  }
  /**
   * Pop the last pointer offset from the mark stack, and set the current
   * pointer offset to the popped value.
   * @see {@link IOBuffer#pushMark}
   * @returns This.
   */
  popMark() {
    const offset = this._marks.pop();
    if (offset === void 0) {
      throw new Error("Mark stack empty");
    }
    this.seek(offset);
    return this;
  }
  /**
   * Move the pointer offset back to 0.
   * @returns This.
   */
  rewind() {
    this.offset = 0;
    return this;
  }
  /**
   * Make sure the buffer has sufficient memory to write a given byteLength at
   * the current pointer offset.
   * If the buffer's memory is insufficient, this method will create a new
   * buffer (a copy) with a length that is twice (byteLength + current offset).
   * @param byteLength - The needed memory in bytes.
   * @returns This.
   */
  ensureAvailable(byteLength = 1) {
    if (!this.available(byteLength)) {
      const lengthNeeded = this.offset + byteLength;
      const newLength = lengthNeeded * 2;
      const newArray = new Uint8Array(newLength);
      newArray.set(new Uint8Array(this.buffer));
      this.buffer = newArray.buffer;
      this.length = newLength;
      this.byteLength = newLength;
      this._data = new DataView(this.buffer);
    }
    return this;
  }
  /**
   * Read a byte and return false if the byte's value is 0, or true otherwise.
   * Moves pointer forward by one byte.
   * @returns The read boolean.
   */
  readBoolean() {
    return this.readUint8() !== 0;
  }
  /**
   * Read a signed 8-bit integer and move pointer forward by 1 byte.
   * @returns The read byte.
   */
  readInt8() {
    return this._data.getInt8(this.offset++);
  }
  /**
   * Read an unsigned 8-bit integer and move pointer forward by 1 byte.
   * @returns The read byte.
   */
  readUint8() {
    return this._data.getUint8(this.offset++);
  }
  /**
   * Alias for {@link IOBuffer#readUint8}.
   * @returns The read byte.
   */
  readByte() {
    return this.readUint8();
  }
  /**
   * Read `n` bytes and move pointer forward by `n` bytes.
   * @param n - Number of bytes to read.
   * @returns The read bytes.
   */
  readBytes(n = 1) {
    return this.readArray(n, "uint8");
  }
  /**
   * Creates an array of corresponding to the type `type` and size `size`.
   * For example type `uint8` will create a `Uint8Array`.
   * @param size - size of the resulting array
   * @param type - number type of elements to read
   * @returns The read array.
   */
  readArray(size, type) {
    const bytes = typedArrays[type].BYTES_PER_ELEMENT * size;
    const offset = this.byteOffset + this.offset;
    const slice = this.buffer.slice(offset, offset + bytes);
    if (this.littleEndian === hostBigEndian && type !== "uint8" && type !== "int8") {
      const slice2 = new Uint8Array(this.buffer.slice(offset, offset + bytes));
      slice2.reverse();
      const returnArray2 = new typedArrays[type](slice2.buffer);
      this.offset += bytes;
      returnArray2.reverse();
      return returnArray2;
    }
    const returnArray = new typedArrays[type](slice);
    this.offset += bytes;
    return returnArray;
  }
  /**
   * Read a 16-bit signed integer and move pointer forward by 2 bytes.
   * @returns The read value.
   */
  readInt16() {
    const value = this._data.getInt16(this.offset, this.littleEndian);
    this.offset += 2;
    return value;
  }
  /**
   * Read a 16-bit unsigned integer and move pointer forward by 2 bytes.
   * @returns The read value.
   */
  readUint16() {
    const value = this._data.getUint16(this.offset, this.littleEndian);
    this.offset += 2;
    return value;
  }
  /**
   * Read a 32-bit signed integer and move pointer forward by 4 bytes.
   * @returns The read value.
   */
  readInt32() {
    const value = this._data.getInt32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  /**
   * Read a 32-bit unsigned integer and move pointer forward by 4 bytes.
   * @returns The read value.
   */
  readUint32() {
    const value = this._data.getUint32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  /**
   * Read a 32-bit floating number and move pointer forward by 4 bytes.
   * @returns The read value.
   */
  readFloat32() {
    const value = this._data.getFloat32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  /**
   * Read a 64-bit floating number and move pointer forward by 8 bytes.
   * @returns The read value.
   */
  readFloat64() {
    const value = this._data.getFloat64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }
  /**
   * Read a 64-bit signed integer number and move pointer forward by 8 bytes.
   * @returns The read value.
   */
  readBigInt64() {
    const value = this._data.getBigInt64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }
  /**
   * Read a 64-bit unsigned integer number and move pointer forward by 8 bytes.
   * @returns The read value.
   */
  readBigUint64() {
    const value = this._data.getBigUint64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }
  /**
   * Read a 1-byte ASCII character and move pointer forward by 1 byte.
   * @returns The read character.
   */
  readChar() {
    return String.fromCharCode(this.readInt8());
  }
  /**
   * Read `n` 1-byte ASCII characters and move pointer forward by `n` bytes.
   * @param n - Number of characters to read.
   * @returns The read characters.
   */
  readChars(n = 1) {
    let result = "";
    for (let i = 0; i < n; i++) {
      result += this.readChar();
    }
    return result;
  }
  /**
   * Read the next `n` bytes, return a UTF-8 decoded string and move pointer
   * forward by `n` bytes.
   * @param n - Number of bytes to read.
   * @returns The decoded string.
   */
  readUtf8(n = 1) {
    return decode(this.readBytes(n));
  }
  /**
   * Read the next `n` bytes, return a string decoded with `encoding` and move pointer
   * forward by `n` bytes.
   * If no encoding is passed, the function is equivalent to @see {@link IOBuffer#readUtf8}
   * @param n - Number of bytes to read.
   * @param encoding - The encoding to use. Default is 'utf8'.
   * @returns The decoded string.
   */
  decodeText(n = 1, encoding = "utf8") {
    return decode(this.readBytes(n), encoding);
  }
  /**
   * Write 0xff if the passed value is truthy, 0x00 otherwise and move pointer
   * forward by 1 byte.
   * @param value - The value to write.
   * @returns This.
   */
  writeBoolean(value) {
    this.writeUint8(value ? 255 : 0);
    return this;
  }
  /**
   * Write `value` as an 8-bit signed integer and move pointer forward by 1 byte.
   * @param value - The value to write.
   * @returns This.
   */
  writeInt8(value) {
    this.ensureAvailable(1);
    this._data.setInt8(this.offset++, value);
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as an 8-bit unsigned integer and move pointer forward by 1
   * byte.
   * @param value - The value to write.
   * @returns This.
   */
  writeUint8(value) {
    this.ensureAvailable(1);
    this._data.setUint8(this.offset++, value);
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * An alias for {@link IOBuffer#writeUint8}.
   * @param value - The value to write.
   * @returns This.
   */
  writeByte(value) {
    return this.writeUint8(value);
  }
  /**
   * Write all elements of `bytes` as uint8 values and move pointer forward by
   * `bytes.length` bytes.
   * @param bytes - The array of bytes to write.
   * @returns This.
   */
  writeBytes(bytes) {
    this.ensureAvailable(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      this._data.setUint8(this.offset++, bytes[i]);
    }
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 16-bit signed integer and move pointer forward by 2
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeInt16(value) {
    this.ensureAvailable(2);
    this._data.setInt16(this.offset, value, this.littleEndian);
    this.offset += 2;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 16-bit unsigned integer and move pointer forward by 2
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeUint16(value) {
    this.ensureAvailable(2);
    this._data.setUint16(this.offset, value, this.littleEndian);
    this.offset += 2;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 32-bit signed integer and move pointer forward by 4
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeInt32(value) {
    this.ensureAvailable(4);
    this._data.setInt32(this.offset, value, this.littleEndian);
    this.offset += 4;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 32-bit unsigned integer and move pointer forward by 4
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeUint32(value) {
    this.ensureAvailable(4);
    this._data.setUint32(this.offset, value, this.littleEndian);
    this.offset += 4;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 32-bit floating number and move pointer forward by 4
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeFloat32(value) {
    this.ensureAvailable(4);
    this._data.setFloat32(this.offset, value, this.littleEndian);
    this.offset += 4;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 64-bit floating number and move pointer forward by 8
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeFloat64(value) {
    this.ensureAvailable(8);
    this._data.setFloat64(this.offset, value, this.littleEndian);
    this.offset += 8;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 64-bit signed bigint and move pointer forward by 8
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeBigInt64(value) {
    this.ensureAvailable(8);
    this._data.setBigInt64(this.offset, value, this.littleEndian);
    this.offset += 8;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write `value` as a 64-bit unsigned bigint and move pointer forward by 8
   * bytes.
   * @param value - The value to write.
   * @returns This.
   */
  writeBigUint64(value) {
    this.ensureAvailable(8);
    this._data.setBigUint64(this.offset, value, this.littleEndian);
    this.offset += 8;
    this._updateLastWrittenByte();
    return this;
  }
  /**
   * Write the charCode of `str`'s first character as an 8-bit unsigned integer
   * and move pointer forward by 1 byte.
   * @param str - The character to write.
   * @returns This.
   */
  writeChar(str) {
    return this.writeUint8(str.charCodeAt(0));
  }
  /**
   * Write the charCodes of all `str`'s characters as 8-bit unsigned integers
   * and move pointer forward by `str.length` bytes.
   * @param str - The characters to write.
   * @returns This.
   */
  writeChars(str) {
    for (let i = 0; i < str.length; i++) {
      this.writeUint8(str.charCodeAt(i));
    }
    return this;
  }
  /**
   * UTF-8 encode and write `str` to the current pointer offset and move pointer
   * forward according to the encoded length.
   * @param str - The string to write.
   * @returns This.
   */
  writeUtf8(str) {
    return this.writeBytes(encode(str));
  }
  /**
   * Export a Uint8Array view of the internal buffer.
   * The view starts at the byte offset and its length
   * is calculated to stop at the last written byte or the original length.
   * @returns A new Uint8Array view.
   */
  toArray() {
    return new Uint8Array(this.buffer, this.byteOffset, this.lastWrittenByte);
  }
  /**
   *  Get the total number of bytes written so far, regardless of the current offset.
   * @returns - Total number of bytes.
   */
  getWrittenByteLength() {
    return this.lastWrittenByte - this.byteOffset;
  }
  /**
   * Update the last written byte offset
   * @private
   */
  _updateLastWrittenByte() {
    if (this.offset > this.lastWrittenByte) {
      this.lastWrittenByte = this.offset;
    }
  }
};

// node_modules/.pnpm/netcdfjs@3.0.0/node_modules/netcdfjs/lib-esm/types.js
var types = {
  BYTE: 1,
  CHAR: 2,
  SHORT: 3,
  INT: 4,
  FLOAT: 5,
  DOUBLE: 6
};
function num2str(type) {
  switch (Number(type)) {
    case types.BYTE:
      return "byte";
    case types.CHAR:
      return "char";
    case types.SHORT:
      return "short";
    case types.INT:
      return "int";
    case types.FLOAT:
      return "float";
    case types.DOUBLE:
      return "double";
    default:
      return "undefined";
  }
}
function num2bytes(type) {
  switch (Number(type)) {
    case types.BYTE:
      return 1;
    case types.CHAR:
      return 1;
    case types.SHORT:
      return 2;
    case types.INT:
      return 4;
    case types.FLOAT:
      return 4;
    case types.DOUBLE:
      return 8;
    default:
      return -1;
  }
}
function str2num(type) {
  switch (String(type)) {
    case "byte":
      return types.BYTE;
    case "char":
      return types.CHAR;
    case "short":
      return types.SHORT;
    case "int":
      return types.INT;
    case "float":
      return types.FLOAT;
    case "double":
      return types.DOUBLE;
    /* istanbul ignore next */
    default:
      return -1;
  }
}
function readNumber(size, bufferReader) {
  if (size !== 1) {
    const numbers = new Array(size);
    for (let i = 0; i < size; i++) {
      numbers[i] = bufferReader();
    }
    return numbers;
  } else {
    return bufferReader();
  }
}
function readType(buffer, type, size) {
  switch (type) {
    case types.BYTE:
      return Array.from(buffer.readBytes(size));
    case types.CHAR:
      return trimNull(buffer.readChars(size));
    case types.SHORT:
      return readNumber(size, buffer.readInt16.bind(buffer));
    case types.INT:
      return readNumber(size, buffer.readInt32.bind(buffer));
    case types.FLOAT:
      return readNumber(size, buffer.readFloat32.bind(buffer));
    case types.DOUBLE:
      return readNumber(size, buffer.readFloat64.bind(buffer));
    default:
      throw new Error(`non valid type ${type}`);
  }
}
function trimNull(value) {
  if (value.charCodeAt(value.length - 1) === 0) {
    return value.substring(0, value.length - 1);
  }
  return value;
}

// node_modules/.pnpm/netcdfjs@3.0.0/node_modules/netcdfjs/lib-esm/data.js
function nonRecord(buffer, variable) {
  const type = str2num(variable.type);
  const size = variable.size / num2bytes(type);
  const data = new Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = readType(buffer, type, 1);
  }
  return data;
}
function record(buffer, variable, recordDimension) {
  const type = str2num(variable.type);
  const width = variable.size ? variable.size / num2bytes(type) : 1;
  const size = recordDimension.length;
  const data = new Array(size);
  const step = recordDimension.recordStep;
  if (step) {
    for (let i = 0; i < size; i++) {
      const currentOffset = buffer.offset;
      data[i] = readType(buffer, type, width);
      buffer.seek(currentOffset + step);
    }
  } else {
    throw new Error("recordDimension.recordStep is undefined");
  }
  return data;
}

// node_modules/.pnpm/netcdfjs@3.0.0/node_modules/netcdfjs/lib-esm/utils.js
function notNetcdf(statement, reason) {
  if (statement) {
    throw new TypeError(`Not a valid NetCDF v3.x file: ${reason}`);
  }
}
function padding(buffer) {
  if (buffer.offset % 4 !== 0) {
    buffer.skip(4 - buffer.offset % 4);
  }
}
function readName(buffer) {
  const nameLength = buffer.readUint32();
  const name = buffer.readChars(nameLength);
  padding(buffer);
  return name;
}

// node_modules/.pnpm/netcdfjs@3.0.0/node_modules/netcdfjs/lib-esm/header.js
var ZERO = 0;
var NC_DIMENSION = 10;
var NC_VARIABLE = 11;
var NC_ATTRIBUTE = 12;
var NC_UNLIMITED = 0;
function header(buffer, version) {
  const header2 = { version };
  const recordDimension = {
    length: buffer.readUint32()
  };
  const dimList = dimensionsList(buffer);
  if (!Array.isArray(dimList)) {
    recordDimension.id = dimList.recordId;
    recordDimension.name = dimList.recordName;
    header2.dimensions = dimList.dimensions;
  }
  header2.globalAttributes = attributesList(buffer);
  const variables = variablesList(buffer, recordDimension?.id, version);
  if (!Array.isArray(variables)) {
    header2.variables = variables.variables;
    recordDimension.recordStep = variables.recordStep;
  }
  header2.recordDimension = recordDimension;
  return header2;
}
function dimensionsList(buffer) {
  const result = {};
  let recordId, recordName;
  const dimList = buffer.readUint32();
  let dimensions;
  if (dimList === ZERO) {
    notNetcdf(buffer.readUint32() !== ZERO, "wrong empty tag for list of dimensions");
    return [];
  } else {
    notNetcdf(dimList !== NC_DIMENSION, "wrong tag for list of dimensions");
    const dimensionSize = buffer.readUint32();
    dimensions = new Array(dimensionSize);
    for (let dim = 0; dim < dimensionSize; dim++) {
      const name = readName(buffer);
      const size = buffer.readUint32();
      if (size === NC_UNLIMITED) {
        recordId = dim;
        recordName = name;
      }
      dimensions[dim] = {
        name,
        size
      };
    }
  }
  if (recordId !== void 0) {
    result.recordId = recordId;
  }
  if (recordName !== void 0) {
    result.recordName = recordName;
  }
  result.dimensions = dimensions;
  return result;
}
function attributesList(buffer) {
  const gAttList = buffer.readUint32();
  let attributes;
  if (gAttList === ZERO) {
    notNetcdf(buffer.readUint32() !== ZERO, "wrong empty tag for list of attributes");
    return [];
  } else {
    notNetcdf(gAttList !== NC_ATTRIBUTE, "wrong tag for list of attributes");
    const attributeSize = buffer.readUint32();
    attributes = new Array(attributeSize);
    for (let gAtt = 0; gAtt < attributeSize; gAtt++) {
      const name = readName(buffer);
      const type = buffer.readUint32();
      notNetcdf(type < 1 || type > 6, `non valid type ${type}`);
      const size = buffer.readUint32();
      const value = readType(buffer, type, size);
      padding(buffer);
      attributes[gAtt] = {
        name,
        type: num2str(type),
        value
      };
    }
  }
  return attributes;
}
function variablesList(buffer, recordId, version) {
  const varList = buffer.readUint32();
  let recordStep = 0;
  let variables;
  if (varList === ZERO) {
    notNetcdf(buffer.readUint32() !== ZERO, "wrong empty tag for list of variables");
    return [];
  } else {
    notNetcdf(varList !== NC_VARIABLE, "wrong tag for list of variables");
    const variableSize = buffer.readUint32();
    variables = new Array(variableSize);
    for (let v = 0; v < variableSize; v++) {
      const name = readName(buffer);
      const dimensionality = buffer.readUint32();
      const dimensionsIds = new Array(dimensionality);
      for (let dim = 0; dim < dimensionality; dim++) {
        dimensionsIds[dim] = buffer.readUint32();
      }
      const attributes = attributesList(buffer);
      const type = buffer.readUint32();
      notNetcdf(type < 1 && type > 6, `non valid type ${type}`);
      const varSize = buffer.readUint32();
      let offset = buffer.readUint32();
      if (version === 2) {
        notNetcdf(offset > 0, "offsets larger than 4GB not supported");
        offset = buffer.readUint32();
      }
      let record2 = false;
      if (typeof recordId !== "undefined" && dimensionsIds[0] === recordId) {
        recordStep += varSize;
        record2 = true;
      }
      variables[v] = {
        name,
        dimensions: dimensionsIds,
        attributes,
        type: num2str(type),
        size: varSize,
        offset,
        record: record2
      };
    }
  }
  return {
    variables,
    recordStep
  };
}

// node_modules/.pnpm/netcdfjs@3.0.0/node_modules/netcdfjs/lib-esm/toString.js
function toString() {
  const result = [];
  result.push("DIMENSIONS");
  for (const dimension of this.dimensions) {
    result.push(`  ${dimension.name.padEnd(30)} = size: ${dimension.size}`);
  }
  result.push("");
  result.push("GLOBAL ATTRIBUTES");
  for (const attribute of this.globalAttributes) {
    result.push(`  ${attribute.name.padEnd(30)} = ${attribute.value}`);
  }
  const variables = JSON.parse(JSON.stringify(this.variables));
  result.push("");
  result.push("VARIABLES:");
  for (const variable of variables) {
    variable.value = this.getDataVariable(variable);
    let stringify = JSON.stringify(variable.value);
    if (stringify.length > 50)
      stringify = stringify.substring(0, 50);
    if (!isNaN(variable.value.length)) {
      stringify += ` (length: ${variable.value.length})`;
    }
    result.push(`  ${variable.name.padEnd(30)} = ${stringify}`);
  }
  return result.join("\n");
}

// node_modules/.pnpm/netcdfjs@3.0.0/node_modules/netcdfjs/lib-esm/parser.js
var NetCDFReader = class {
  constructor(data) {
    this.toString = toString;
    const buffer = new IOBuffer(data);
    buffer.setBigEndian();
    notNetcdf(buffer.readChars(3) !== "CDF", "should start with CDF");
    const version = buffer.readByte();
    notNetcdf(version > 2, "unknown version");
    this.header = header(buffer, version);
    this.buffer = buffer;
  }
  /**
   * @return - Version for the NetCDF format
   */
  get version() {
    if (this.header.version === 1) {
      return "classic format";
    } else {
      return "64-bit offset format";
    }
  }
  /**
   * @return {object} - Metadata for the record dimension
   *  * `length`: Number of elements in the record dimension
   *  * `id`: Id number in the list of dimensions for the record dimension
   *  * `name`: String with the name of the record dimension
   *  * `recordStep`: Number with the record variables step size
   */
  get recordDimension() {
    return this.header.recordDimension;
  }
  /**
   * @return - Array - List of dimensions with:
   *  * `name`: String with the name of the dimension
   *  * `size`: Number with the size of the dimension
   */
  get dimensions() {
    return this.header.dimensions;
  }
  /**
   * @return - Array - List of global attributes with:
   *  * `name`: String with the name of the attribute
   *  * `type`: String with the type of the attribute
   *  * `value`: A number or string with the value of the attribute
   */
  get globalAttributes() {
    return this.header.globalAttributes;
  }
  /**
   * Returns the value of an attribute
   * @param - AttributeName
   * @return - Value of the attributeName or null
   */
  getAttribute(attributeName) {
    const attribute = this.globalAttributes.find((val) => val.name === attributeName);
    if (attribute)
      return attribute.value;
    return null;
  }
  /**
   * Returns the value of a variable as a string
   * @param - variableName
   * @return - Value of the variable as a string or null
   */
  getDataVariableAsString(variableName) {
    const variable = this.getDataVariable(variableName);
    if (variable)
      return variable.join("");
    return null;
  }
  get variables() {
    return this.header.variables;
  }
  /**
   * Retrieves the data for a given variable
   * @param variableName - Name of the variable to search or variable object
   * @return The variable values
   */
  getDataVariable(variableName) {
    let variable;
    if (typeof variableName === "string") {
      variable = this.header.variables.find((val) => {
        return val.name === variableName;
      });
    } else {
      variable = variableName;
    }
    if (variable === void 0) {
      throw new Error("Not a valid NetCDF v3.x file: variable not found");
    }
    this.buffer.seek(variable.offset);
    if (variable.record) {
      return record(this.buffer, variable, this.header.recordDimension);
    } else {
      return nonRecord(this.buffer, variable);
    }
  }
  /**
   * Check if a dataVariable exists
   * @param variableName - Name of the variable to find
   * @return boolean
   */
  dataVariableExists(variableName) {
    const variable = this.header.variables.find((val) => {
      return val.name === variableName;
    });
    return variable !== void 0;
  }
  /**
   * Check if an attribute exists
   * @param attributeName - Name of the attribute to find
   * @return boolean
   */
  attributeExists(attributeName) {
    const attribute = this.globalAttributes.find((val) => val.name === attributeName);
    return attribute !== void 0;
  }
};
export {
  NetCDFReader
};
