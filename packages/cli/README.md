# @open-document/cli

**English** · [繁體中文](README.zh-TW.md)

Scaffold an [open-doc](https://github.com/simonliu-ai-product/open-doc) workspace — documents as React, one component per printed page.

```bash
npx @open-document/cli init my-docs
cd my-docs
pnpm dev
```

The scaffolded workspace ships with the `create-doc` and `doc-authoring` agent skills preconfigured (`.agents/skills`, linked into `.claude/skills`), a sample document, and the `open-doc` dev/build/preview scripts.

It also writes a `pnpm-workspace.yaml` allowing esbuild's postinstall to run. pnpm blocks build scripts by default and Vite cannot start without that one; the file is inert under npm, yarn, and bun.

## Flags

```
open-doc init [dir]
  -f, --force        overwrite a non-empty target directory
  -n, --name <name>  package name (defaults to the folder name)
  --use-pnpm         (or --use-npm / --use-yarn / --use-bun)
  --no-install       skip dependency installation
  --no-git           skip git init and the initial commit
  -t, --template <name>  start with a document from a template

open-doc templates   list the template names --template takes
```

MIT
