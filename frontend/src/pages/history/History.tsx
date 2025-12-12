import { Component } from "solid-js";
import { CommandCard } from "~/components/common/CommandCard";
import HistoryTable from "./components/HistoryTable";

const HistoryPage: Component = () => {
  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Command History"
        description="View and manage the history of executed commands."
      >
        <HistoryTable />
      </CommandCard>
    </div>
  );
};

export default HistoryPage;
