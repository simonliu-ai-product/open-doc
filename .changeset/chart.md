---
'@open-document/core': minor
---

`<Chart>` draws bar, line and pie charts from data. You no longer need to build
them by hand from `div`s:

```tsx
import costs from './data/costs.csv';

<Chart data={costs} x="month" y={['cost', 'budget']} format="integer"
       caption="每月費用與預算" />
<Chart type="line" data={costs} x="month" y="uptime" format="percent" values />
<Chart type="pie" data={services} x="service" y="cost" values />
```

- **Bars**: grouped or `stacked`, and they stand on zero, negative values
  included.
- **Lines**: one per series.
- **Pies**: a legend that gives each slice's share.
- **Axes**: ticks fall on round numbers. Crowded category labels thin out
  instead of colliding. `format` takes the same values as `<DataTable>`.
- **Colours**: the document's accent, then tints of it and of the text colour,
  so a chart changes with the design.
- **Layout**: drawn synchronously into a fixed box, so it paginates like any
  other block.
- **Figures**: with a caption it is numbered and appears in
  `<ListOfFigures />`.
- **Word**: the export places it as a picture.
