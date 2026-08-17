import { Component, createMemo, For } from "solid-js";

interface CsvVisualizerProps {
  data: string;
}

export const CsvVisualizer: Component<CsvVisualizerProps> = (props) => {
  const parsedData = createMemo(() => {
    const text = props.data || "";
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentCell += '""';
          i++;
        } else {
          insideQuotes = !insideQuotes;
          currentCell += '"';
        }
      } else if (char === "," && !insideQuotes) {
        currentRow.push(currentCell);
        currentCell = "";
      } else if ((char === "\r" || char === "\n") && !insideQuotes) {
        if (char === "\r" && nextChar === "\n") {
          i++;
        }
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += char;
      }
    }

    if (currentRow.length > 0 || currentCell.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }
    rows.sort((a, b) => b.length - a.length);

    return rows;
  });

  const maxColumns = createMemo(() => {
    const data = parsedData();
    if (data.length === 0) return 0;
    return Math.max(...data.map((row) => row.length));
  });

  return (
    <div class="w-full overflow-auto border rounded-md">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <For each={Array.from({ length: maxColumns() })}>
              {(_, index) => (
                <th class="h-10 px-4 text-left align-middle font-medium text-muted-foreground border-r last:border-r-0 border-b">
                  Col {index() + 1}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={parsedData()}>
            {(row) => (
              <tr class="hover:bg-muted/50 data-[state=selected]:bg-muted">
                <For each={Array.from({ length: maxColumns() })}>
                  {(_, colIndex) => (
                    <td class="p-2 align-middle border-r last:border-r-0 border-b border-border whitespace-pre text-wrap break-all min-w-[150px]">
                      {row[colIndex()] || ""}
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
};
