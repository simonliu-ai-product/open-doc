---
'@open-document/core': patch
---

Centre the document title in the viewer header and drop the subtitle line

The header laid the title out in a `flex-1` block right after the back link, so
it sat at the centre of the *leftover* space — visibly left of the bar's centre,
because the control cluster on the right is many times wider than the back link.
The header is now a three-column grid with equal `1fr` rails, which puts the
title at the true centre whenever the controls fit their share, and slides it
rather than colliding when they don't.

`meta.subtitle` no longer renders in the header. It was a second line of small
grey text competing with the page it describes; the document browser still shows
it, and it still belongs on a cover page.
