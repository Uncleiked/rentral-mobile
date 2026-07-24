import { Oluso, registerOlusoProcessHandlers, createOnRequestError } from '@oluso/nextjs';

export const oluso = new Oluso({
  apiKey: process.env.OLUSO_API_KEY!,
  environment: process.env.NODE_ENV,
});

export async function register() {
  registerOlusoProcessHandlers(oluso);
}

export const onRequestError = createOnRequestError(oluso);
