# @open-document/core

## 0.2.0

### Minor Changes

- [#12](https://github.com/simonliu-ai-product/open-doc/pull/12) [`40e8f98`](https://github.com/simonliu-ai-product/open-doc/commit/40e8f9810b3d8f51264b72974af10e8a3d137cab) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Publish the reader's position to `node_modules/.open-doc/current.json` while `open-doc dev` runs, and ship a `current-doc` skill so an agent can resolve "this page" and "this element" without asking. The cursor carries the document id, the rendered page number, the source path, and whatever the inspector has selected; a selection clears when you move to another sheet.

### Patch Changes

- [#13](https://github.com/simonliu-ai-product/open-doc/pull/13) [`fa2f15f`](https://github.com/simonliu-ai-product/open-doc/commit/fa2f15f7ae284b3020be0fb90979ac28288ffeec) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Move to vite 8, `@vitejs/plugin-react` 6, and `@babel/parser` 8. Build output keeps its `.js` / `.d.ts` names — tsdown 0.22 would otherwise rename everything to `.mjs` / `.d.mts` and break the exports map.

- [#10](https://github.com/simonliu-ai-product/open-doc/pull/10) [`d70eafe`](https://github.com/simonliu-ai-product/open-doc/commit/d70eafe811dd8334334c403672c69e38b055a5ad) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Mark the viewer's scrolling pane with `data-od-viewer` so page frames in the main pane can be told apart from the thumbnail rail.
