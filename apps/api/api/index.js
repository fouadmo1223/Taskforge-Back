// Vercel serverless entry point. Requires the *compiled* JS output (built by
// `pnpm build` -> `nest build` into ../dist), not the TypeScript source —
// so Vercel's Node builder has nothing left to type-check/bundle itself
// (avoids duplicate/mismatched @types across the monorepo, and Nest's
// decorators are already baked into the compiled output).
//
// Reuses the same createApp() used by the standalone server (../src/main.ts).
const { createApp } = require('../dist/create-app.js');

let handlerPromise;
 
function getHandler() {
  if (!handlerPromise) {
    handlerPromise = createApp().then(async ({ app }) => {
      await app.init();
      return app.getHttpAdapter().getInstance();
    });
  }
  return handlerPromise;
}

module.exports = async (req, res) => {
  const handler = await getHandler();
  handler(req, res);
};
