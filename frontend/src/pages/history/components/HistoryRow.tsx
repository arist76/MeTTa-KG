import { Component, Show } from "solid-js";
import { HistoryItem } from "../lib";
import CopyableText from "./CopyableText";

interface HistoryRowProps {
  item: HistoryItem;
  formatDate: (ts: number) => string;
}

const HistoryRow: Component<HistoryRowProps> = (props) => {
  return (
    <tr class="border-t hover:bg-muted/50 transition-colors">
      <td class="p-4 align-top">{props.formatDate(props.item.timestamp)}</td>
      <td class="p-4 align-top">
        <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary text-primary-foreground hover:bg-primary/80">
          {props.item.command}
        </span>
      </td>
      <td class="p-4 align-top">
        <div class="flex flex-col gap-1 max-w-[150px]">
          {props.item.details}
        </div>
      </td>
      <td class="p-4 align-top">
        <Show when={props.item.pattern}>
          <CopyableText text={props.item.pattern} id={`p-${props.item.id}`} />
        </Show>
      </td>
      <td class="p-4 align-top">
        <CopyableText
          text={props.item.template}
          id={`t-${props.item.id}`}
          fallback="-"
        />
      </td>
    </tr>
  );
};

export default HistoryRow;
