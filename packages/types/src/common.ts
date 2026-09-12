export type ID = string;

export type ISODateString = string;

export type Locale = 'en' | 'ar';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface Timestamps {
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface SoftDeletable {
  deletedAt: ISODateString | null;
  deletedBy: ID | null;
}

export interface CloudinaryAsset {
  publicId: string;
  secureUrl: string;
  resourceType: 'image' | 'video' | 'raw';
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  originalFilename: string | null;
  uploadedBy: ID;
  createdAt: ISODateString;
}

export interface UserSummary {
  id: ID;
  name: string;
  email: string;
  avatar: CloudinaryAsset | null;
}
