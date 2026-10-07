import { describe, expect, it } from 'vitest';
import {
  parseUnifiedDiff,
  placeHunks,
  revertHunkIn,
  untrackedFile,
  withoutReviewMarkers,
} from './changes-diff.ts';

const DIFF = `diff --git a/docs/report/index.tsx b/docs/report/index.tsx
index 1111111..2222222 100644
--- a/docs/report/index.tsx
+++ b/docs/report/index.tsx
@@ -3 +3 @@ const Page = () => (
-    <h1>Old title</h1>
+    <h1>New title</h1>
@@ -6,0 +7,3 @@ const Page = () => (
+    <p>
+      A new paragraph
+    </p>
@@ -9,2 +11,0 @@ const Page = () => (
-    <p>Gone</p>
-    <p>Also gone</p>
diff --git a/docs/report/data/rows.csv b/docs/report/data/rows.csv
--- a/docs/report/data/rows.csv
+++ b/docs/report/data/rows.csv
@@ -2 +2 @@
-a,1
+a,2
diff --git a/docs/report/logo.png b/docs/report/logo.png
Binary files a/docs/report/logo.png and b/docs/report/logo.png differ
diff --git a/docs/other/index.tsx b/docs/other/index.tsx
--- a/docs/other/index.tsx
+++ b/docs/other/index.tsx
@@ -1 +1 @@
-x
+y
`;

const CURRENT = `const Page = () => (
  <div>
    <h1>New title</h1>
    <p>
      Kept paragraph
    </p>
    <p>
      A new paragraph
    </p>
    <section>
      <p>After the gap</p>
    </section>
  </div>
);
`;

describe('parseUnifiedDiff', () => {
  it('reads hunks per file, inside the document folder only', () => {
    const files = parseUnifiedDiff(DIFF, 'docs/report/');
    expect(files.map((f) => [f.path, f.status, f.binary, f.hunks.length])).toEqual([
      ['index.tsx', 'modified', false, 3],
      ['data/rows.csv', 'modified', false, 1],
      ['logo.png', 'modified', true, 0],
    ]);
    const [title, added, gone] = files[0]?.hunks ?? [];
    expect(title).toMatchObject({
      oldStart: 3,
      newStart: 3,
      newLines: 1,
      added: ['    <h1>New title</h1>'],
    });
    expect(added).toMatchObject({ oldLines: 0, newStart: 7, newLines: 3 });
    expect(gone).toMatchObject({
      newStart: 11,
      newLines: 0,
      removed: ['    <p>Gone</p>', '    <p>Also gone</p>'],
    });
    expect(title?.id).toMatch(/^[0-9a-f]{12}$/);
  });

  it('marks a new file as added', () => {
    const files = parseUnifiedDiff(
      `diff --git a/docs/r/index.tsx b/docs/r/index.tsx
new file mode 100644
--- /dev/null
+++ b/docs/r/index.tsx
@@ -0,0 +1,2 @@
+a
+b
`,
      'docs/r/',
    );
    expect(files[0]).toMatchObject({ path: 'index.tsx', status: 'added' });
  });
});

describe('placeHunks', () => {
  it('puts each hunk on the elements it touches', () => {
    const hunks = [
      {
        id: 'a',
        oldStart: 3,
        oldLines: 1,
        newStart: 3,
        newLines: 1,
        removed: [],
        added: [],
        targets: [],
      },
      {
        id: 'b',
        oldStart: 6,
        oldLines: 0,
        newStart: 7,
        newLines: 3,
        removed: [],
        added: [],
        targets: [],
      },
      {
        id: 'c',
        oldStart: 5,
        oldLines: 1,
        newStart: 5,
        newLines: 1,
        removed: [],
        added: [],
        targets: [],
      },
      {
        id: 'd',
        oldStart: 9,
        oldLines: 2,
        newStart: 9,
        newLines: 0,
        removed: [],
        added: [],
        targets: [],
      },
    ];
    placeHunks(CURRENT, hunks);
    expect(hunks.map((h) => h.targets)).toEqual([
      [{ loc: '3:4', mark: 'changed' }],
      [{ loc: '7:4', mark: 'added' }],
      // Text inside an element: the element is what changed.
      [{ loc: '4:4', mark: 'changed' }],
      // Lines taken out after line 9: the next element stands in their place.
      [{ loc: '10:4', mark: 'removed-before' }],
    ]);
  });

  it('leaves a hunk outside the JSX without a place on the page', () => {
    const source = `const meta = { title: 'x' };\nconst Page = () => <p>y</p>;\n`;
    const hunks = [
      {
        id: 'a',
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 1,
        removed: [],
        added: [],
        targets: [],
      },
    ];
    placeHunks(source, hunks);
    expect(hunks[0]?.targets).toEqual([]);
  });
});

describe('revertHunkIn', () => {
  it('puts the old lines back', () => {
    const [file] = parseUnifiedDiff(DIFF, 'docs/report/');
    const [title, added] = file?.hunks ?? [];
    const once = revertHunkIn(CURRENT, title as never);
    expect(once).toContain('<h1>Old title</h1>');
    const twice = revertHunkIn(once as string, added as never);
    expect(twice).not.toContain('A new paragraph');
    expect(twice?.endsWith('\n')).toBe(true);
  });

  it('puts removed lines back after the line they followed', () => {
    const source = 'a\nb\nc\n';
    const [file] = parseUnifiedDiff(
      `diff --git a/d/x.txt b/d/x.txt
--- a/d/x.txt
+++ b/d/x.txt
@@ -2,2 +1,0 @@
-gone1
-gone2
`,
      'd/',
    );
    expect(revertHunkIn(source, file?.hunks[0] as never)).toBe('a\ngone1\ngone2\nb\nc\n');
  });

  it('refuses when the file moved on since the diff was read', () => {
    const [file] = parseUnifiedDiff(DIFF, 'docs/report/');
    expect(
      revertHunkIn(CURRENT.replace('New title', 'Newer title'), file?.hunks[0] as never),
    ).toBeNull();
  });

  it('takes back an untracked file line by line', () => {
    const file = untrackedFile('index.tsx', 'one\ntwo\n');
    expect(file.hunks[0]).toMatchObject({ newStart: 1, newLines: 2, added: ['one', 'two'] });
  });
});

describe('withoutReviewMarkers', () => {
  it('leaves out a hunk that only adds a review comment', () => {
    const files = parseUnifiedDiff(
      `diff --git a/d/index.tsx b/d/index.tsx
--- a/d/index.tsx
+++ b/d/index.tsx
@@ -3,0 +4 @@
+      {/* @doc-comment id="c-1a2b3c4d" ts="2026-10-07T00:00:00.000Z" text="eyJub3RlIjoieCJ9" */}
@@ -8 +9 @@
-    <p>Old</p>
+    <p>New</p>
`,
      'd/',
    );
    expect(withoutReviewMarkers(files)[0]?.hunks.map((h) => h.added)).toEqual([['    <p>New</p>']]);
  });
});
