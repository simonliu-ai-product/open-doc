---
"@open-document/core": patch
---

The version at the foot of the document browser no longer says `dev` or `static` to everyone. A core installed from npm shows its version alone; only a core run from a source checkout (a `link:`, `file:` or `workspace:` dependency) adds `dev`, so a framework build in progress can be told apart.
