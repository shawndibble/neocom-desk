import { handleRequest } from './janiceProxy.mjs';

export default {
  fetch: (request, env) => handleRequest(request, env),
};
