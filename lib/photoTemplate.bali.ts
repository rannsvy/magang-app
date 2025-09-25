// lib/photoTemplate.bali.ts
export type PhotoInputType = "photo" | "photo+sn" | "photo+cable";
export interface PhotoTemplateItem {
  id: string;
  name: string;
  type: PhotoInputType;
  sort: number;
}

// === hasil generate-mu kemarin ===
export const PHOTO_TEMPLATE_BY_LOKASI_WITH_TYPES: Record<
  string,
  PhotoTemplateItem[]
> = {
};

export function getTemplateForLocationWithTypes(
  lokasi: string
): PhotoTemplateItem[] {
  return PHOTO_TEMPLATE_BY_LOKASI_WITH_TYPES[lokasi] ?? [];
}

export const LOKASI_OPTIONS = Object.keys(PHOTO_TEMPLATE_BY_LOKASI_WITH_TYPES);
