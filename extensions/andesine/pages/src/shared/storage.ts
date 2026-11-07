/** The collection's site in the installation's storage, shared by the backend and the panel. */
const getSiteKey = (collectionID: string): string => `site:${collectionID}`;

export { getSiteKey };
