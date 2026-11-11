import { handleRequest } from './shortLinkProxy.mjs';

export default {
  fetch: (request, env) => handleRequest(request, env),
};
