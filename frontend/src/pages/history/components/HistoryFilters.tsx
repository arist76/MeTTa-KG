import { Component } from "solid-js";
import { Accessor, Setter } from "solid-js";
import { TextField, TextFieldInput } from "~/components/ui/TextField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/Select";
import { Button } from "~/components/ui/Button";
import ArrowUpDown from "lucide-solid/icons/arrow-up-down";

interface HistoryFiltersProps {
  search: Accessor<string>;
  setSearch: Setter<string>;
  filterCommand: Accessor<string>;
  setFilterCommand: Setter<string>;
  sortDesc: Accessor<boolean>;
  setSortDesc: Setter<boolean>;
}

const HistoryFilters: Component<HistoryFiltersProps> = (props) => {
  return (
    <div class="flex gap-4 items-center">
      <div class="w-64">
        <TextField>
          <TextFieldInput
            placeholder="Search patterns..."
            value={props.search()}
            onInput={(e) => props.setSearch(e.currentTarget.value)}
          />
        </TextField>
      </div>
      <div class="w-48">
        <Select
          value={props.filterCommand()}
          onChange={props.setFilterCommand}
          options={[
            "All",
            "Clear",
            "Composition",
            "Export",
            "Transform",
            "Union",
            "Upload",
          ]}
          itemComponent={(selectProps) => (
            <SelectItem item={selectProps.item}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(selectProps.item as any).rawValue}
            </SelectItem>
          )}
        >
          <SelectTrigger>
            <SelectValue<string> />
          </SelectTrigger>
          <SelectContent />
        </Select>
      </div>
      <Button
        variant="ghost"
        onClick={() => props.setSortDesc(!props.sortDesc())}
        title="Toggle Sort Order"
      >
        <ArrowUpDown class="h-4 w-4 mr-2" />
        {props.sortDesc() ? "Newest First" : "Oldest First"}
      </Button>
    </div>
  );
};

export default HistoryFilters;
