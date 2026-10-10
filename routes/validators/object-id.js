const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates a public database id. The Postgres migration uses UUID primary keys.
 * If the field is undefined, null, or invalid, it sets the field to null.
 * @param {object} object
 * @param {string} field
 * @returns {{ [field: string]: string | null }}
 */
export default function validateObjectId (object, field) {
  function getFieldValue (value) {
    if (value === undefined || value === null) { return null; }
    if (typeof value !== 'string') { return null; }
    return UUID_RE.test(value) ? value : null;
  }
  object[field] = getFieldValue(object[field]);
  return object;
}

/**
 * Validates the '_id' field of an object.
 * Also allows for the 'id' field to be used as an alias for '_id' if '_id' is not present.
 */
export function _id (object) {
  if (!object._id && object.id) { object._id = object.id; }
  return validateObjectId(object, '_id');
}

export function set_id (object) { // eslint-disable-line camelcase
  object.set_id ??= object.setId;
  return validateObjectId(object, 'set_id');
}
