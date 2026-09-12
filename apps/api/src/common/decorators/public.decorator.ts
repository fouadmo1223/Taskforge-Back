import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'flowdesk:is_public';

/** Marks a route as not requiring an authenticated user (the global JWT guard skips it). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
