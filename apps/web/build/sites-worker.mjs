import handler from "vinext/server/fetch-handler";

export default {
  fetch(request, env, ctx) {
    return handler.fetch(request, env, ctx);
  },
};
