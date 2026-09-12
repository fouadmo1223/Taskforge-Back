import { Injectable, type PipeTransform } from '@nestjs/common';
import { isValidObjectId, Types } from 'mongoose';
import { ApiException } from '../http/api-exception.js';

/** Validates a route/query param is a well-formed Mongo ObjectId and returns it as a string. */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !isValidObjectId(value)) {
      throw ApiException.validation('Malformed identifier.');
    }
    // Normalise (rejects 12-char string ids that `isValidObjectId` lets through).
    return new Types.ObjectId(value).toHexString() === value.toLowerCase()
      ? value
      : new Types.ObjectId(value).toHexString();
  }
}
