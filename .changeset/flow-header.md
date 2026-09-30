---
'@open-document/core': minor
---

`flow()` takes a running `header` alongside `footer`:

```tsx
flow(<>…</>, { header: Header, footer: Footer })
```

It prints on every page the section expands into, with `useDocPageNumber()` and
`useDocPageCount()` working inside it. Position it absolutely in the top margin
band, like a footer in the bottom one; neither takes space from the blocks.

The Word export carries it as a real Word header, page numbers as `PAGE` /
`NUMPAGES` fields. Fixed pages sit in sections with no header or footer.
