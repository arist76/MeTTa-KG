import { JSX } from "solid-js/jsx-runtime";
import { createMemo, Show } from "solid-js";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { CsvVisualizer } from "./CsvVisualizer";
import { JsonVisualizer } from "./JsonVisualizer";

interface OutputViewerProps {
  title?: string;
  data: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
  format?: "json" | "text" | "metta" | "csv" | "raw";
  status?: "success" | "error" | "loading";
}

export function OutputViewer(props: OutputViewerProps): JSX.Element {
  const statusStyles = createMemo(() => {
    switch (props.status) {
      case "success":
        // Use the darker foreground color for the background to ensure visibility
        return "bg-primary text-primary-foreground";
      case "error":
        return "bg-destructive text-destructive-foreground border-transparent";
      case "loading":
        return "bg-warning text-warning-foreground border-transparent";
      default:
        return "bg-muted text-muted-foreground";
    }
  });

  const Content = createMemo(() => {
    if (props.data === null || props.data === undefined) {
      return "No output";
    }
    if (typeof props.data === "string" && props.data.trim() === "") {
      return "Empty response";
    }

    if (props.format === "csv" && typeof props.data === "string") {
      return <CsvVisualizer data={props.data} />;
    }

    if (props.format === "json") {
      if (typeof props.data === "string") {
        try {
          const parsed = JSON.parse(props.data);
          return <JsonVisualizer data={parsed} />;
        } catch {
          // Fallback to text if parsing fails
        }
      } else if (typeof props.data === "object") {
        return <JsonVisualizer data={props.data} />;
      }
    }

    if (typeof props.data === "object") {
      return JSON.stringify(props.data, null, 2);
    }
    return String(props.data);
  });

  return (
    <Card>
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium">
          {props.title ?? "Output"}
        </CardTitle>
        <Badge class={statusStyles()}>{props.status ?? "unknown"}</Badge>
      </CardHeader>
      <CardContent>
        <div class="min-h-[120px] max-h-[600px] w-full rounded-md border border-border bg-muted p-4 overflow-auto">
          <Show 
            when={typeof Content() !== 'string'}
            fallback={
              <pre class="text-sm font-mono whitespace-pre-wrap text-foreground">
                {Content()}
              </pre>
            }
          >
            {Content()}
          </Show>
        </div>
      </CardContent>
    </Card>
  );
}
