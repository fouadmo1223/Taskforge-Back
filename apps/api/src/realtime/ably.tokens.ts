/** DI token for the Ably REST client. In its own file to avoid a circular import
 *  between the module and the services that consume it. */
export const ABLY_REST = Symbol('ABLY_REST');
