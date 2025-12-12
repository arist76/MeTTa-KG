import { Component, For, createSignal, createMemo } from "solid-js";
import { history } from "../lib";
import HistoryFilters from "./HistoryFilters";
import HistoryRow from "./HistoryRow";

const HistoryTable: Component = () => {
  const [search, setSearch] = createSignal("");
  const [filterCommand, setFilterCommand] = createSignal<string>("All");
  const [sortDesc, setSortDesc] = createSignal(true);

  const filteredHistory = createMemo(() => {
    let items = [...history];

    if (filterCommand() !== "All") {
      items = items.filter((item) => item.command === filterCommand());
    }

    if (search().trim()) {
      const term = search().toLowerCase();
      items = items.filter(
        (item) =>
          item.pattern?.toLowerCase().includes(term) ||
          item.template?.toLowerCase().includes(term) ||
          item.details?.toLowerCase().includes(term)
      );
    }

    return items.sort((a, b) => {
      return sortDesc() ? b.timestamp - a.timestamp : a.timestamp - b.timestamp;
    });
  });

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString();
  };

  return (
    <div class="space-y-4">
      <HistoryFilters
        search={search}
        setSearch={setSearch}
        filterCommand={filterCommand}
        setFilterCommand={setFilterCommand}
        sortDesc={sortDesc}
        setSortDesc={setSortDesc}
      />

      <div class="rounded-md border">
        <table class="w-full text-sm text-left table-fixed">
          <thead class="bg-muted/50 text-muted-foreground font-medium">
            <tr>
              <th class="p-4 w-[180px]">Timestamp</th>
              <th class="p-4 w-[120px]">Command</th>
              <th class="p-4 w-[150px]">Namespace</th>
              <th class="p-4 w-1/4">Pattern</th>
              <th class="p-4 w-1/4">Template</th>
            </tr>
          </thead>
          <tbody>
            <For
              each={filteredHistory()}
              fallback={
                <tr>
                  <td colspan="5" class="p-4 text-center text-muted-foreground">
                    No history records found.
                  </td>
                </tr>
              }
            >
              {(item) => <HistoryRow item={item} formatDate={formatDate} />}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoryTable;
