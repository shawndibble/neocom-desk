import { http, HttpResponse } from 'msw';
import { ESI_BASE_URL } from '@/esi/client';
import { R2_SNAPSHOT_ORIGIN } from '@/features/contractSearch/r2OfferSnapshot';

export const fallbackSourcesDown = [
  http.get(`${ESI_BASE_URL}/markets/*`, () => HttpResponse.error()),
  http.get(`${R2_SNAPSHOT_ORIGIN}/hauling-books/*`, () => new HttpResponse(null, { status: 404 })),
  http.get(`${R2_SNAPSHOT_ORIGIN}/open-prices/*`, () => new HttpResponse(null, { status: 404 })),
];
