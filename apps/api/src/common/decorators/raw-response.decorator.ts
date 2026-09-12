import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE = 'flowdesk:raw_response';

/** Skip the `{ data, meta }` envelope for this handler. */
export const RawResponse = (): MethodDecorator & ClassDecorator => SetMetadata(RAW_RESPONSE, true);
