# @open-document/cli

## 0.1.1

### Patch Changes

- [#15](https://github.com/simonliu-ai-product/open-doc/pull/15) [`f215074`](https://github.com/simonliu-ai-product/open-doc/commit/f215074413b2f101451cd0a84229567c7050080a) Thanks [@LiuYuWei](https://github.com/LiuYuWei)! - Scaffold new workspaces against `@open-document/core` 0.2.0. The version range is stamped in at build time, so the previous release pinned new projects to `^0.1.0` — which under semver's 0.x rule excludes 0.2.0, leaving them without the `current-doc` cursor.
