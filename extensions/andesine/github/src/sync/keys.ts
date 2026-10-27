/** Extension storage keys that the backend writes and the views watch. */
const CONNECTION_KEY = "connection";
const MAPPING_KEY_PREFIX = "mapping:";

const getMappingKey = (collectionID: string): string => `${MAPPING_KEY_PREFIX}${collectionID}`;
const getStateKey = (collectionID: string): string => `state:${collectionID}`;

export { CONNECTION_KEY, MAPPING_KEY_PREFIX, getMappingKey, getStateKey };
